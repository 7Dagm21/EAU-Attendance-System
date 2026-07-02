import AttendanceImportModal from "@/components/admin/AttendanceImportModal";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  ClipboardList,
  Users,
  LogOut,
  Plus,
  Clock,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import eauLogo from "@/assets/eau-logo.png";
import {
  getSemestersApi,
  getOfferingsApi,
  getOfferingStudentsApi,
  getOfferingSummaryApi,
  submitAttendanceApi,
} from "@/api/axios";

interface Semester {
  id: number;
  label: string;
  number: number;
  is_current: boolean;
}
interface Offering {
  id: number;
  course_name: string;
  course_code: string;
  total_credit_hours: string;
  section_name: string;
  section_year: number;
  programme_name: string;
  teacher_name: string;
  semester_label: string;
}
interface Student {
  id: number;
  full_name: string;
  student_id: string;
}

type AttendanceStatus = "present" | "late" | "excused" | "absent";

const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
};

// Sort any student list alphabetically by full_name
const sortAlpha = (list: Student[]) =>
  [...list].sort((a, b) => a.full_name.localeCompare(b.full_name));

const TeacherDashboard = () => {
  const { signOut, user } = useAuth();

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState("");

  const [myOfferings, setMyOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState("");
  const [loadingOfferings, setLoadingOfferings] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<any[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [sessionHours, setSessionHours] = useState("1.5");
  const [sessionType, setSessionType] = useState("theory");
  const [attendanceMap, setAttendanceMap] = useState<
    Record<number, AttendanceStatus>
  >({});
  const [commentMap, setCommentMap] = useState<Record<number, string>>({});
  const [shortName, setShortName] = useState(false);
  const [liveTime, setLiveTime] = useState(
    format(new Date(), "hh:mm:ss aa").toUpperCase(),
  );

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(format(new Date(), "hh:mm:ss aa").toUpperCase());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load semesters on mount, auto-select current
  useEffect(() => {
    getSemestersApi().then((res) => {
      const sems = res.data || [];
      setSemesters(sems);
      const current = sems.find((s: Semester) => s.is_current);
      if (current) setSelectedSemester(String(current.id));
    });
  }, []);

  // When semester changes — load this teacher's offerings
  useEffect(() => {
    if (!selectedSemester) return;
    setLoadingOfferings(true);
    setMyOfferings([]);
    setSelectedOffering("");
    setStudents([]);
    setSummary([]);
    getOfferingsApi({ semester: parseInt(selectedSemester) })
      .then((res) => setMyOfferings(res.data || []))
      .catch(() => setMyOfferings([]))
      .finally(() => setLoadingOfferings(false));
  }, [selectedSemester]);

  // When offering selected — load students and summary, both sorted alphabetically
  useEffect(() => {
    if (!selectedOffering) return;
    const offeringId = parseInt(selectedOffering);
    Promise.all([
      getOfferingStudentsApi(offeringId),
      getOfferingSummaryApi(offeringId),
    ]).then(([studRes, sumRes]) => {
      const studentList = sortAlpha(studRes.data.students || []);
      setStudents(studentList);

      // Sort summary rows alphabetically by student name
      const summaryList = [...(sumRes.data.summary || [])].sort((a: any, b: any) =>
        a.student.full_name.localeCompare(b.student.full_name),
      );
      setSummary(summaryList);

      // Default everyone to "present" in attendance map
      const defaults: Record<number, AttendanceStatus> = {};
      studentList.forEach((s: Student) => {
        defaults[s.id] = "present";
      });
      setAttendanceMap(defaults);
      setCommentMap({});
    });
  }, [selectedOffering]);

  const currentOffering = myOfferings.find(
    (o) => o.id === parseInt(selectedOffering),
  );

  const getDisplayName = (name: string) => {
    if (!shortName) return name;
    const parts = name.split(" ");
    return parts.length > 1 ? `${parts[0]} ${parts[1].charAt(0)}.` : name;
  };

  const handleSubmit = async () => {
    if (!selectedOffering) return;
    setSubmitting(true);
    try {
      const records = students.map((s) => ({
        student_id: s.id,
        status: attendanceMap[s.id] || "present",
        comment: commentMap[s.id] || "",
      }));
      await submitAttendanceApi({
        course_offering_id: parseInt(selectedOffering),
        date: attendanceDate,
        session_type: sessionType,
        session_hours: parseFloat(sessionHours),
        records,
      });
      toast.success("Attendance submitted successfully!");
      setDialogOpen(false);
      // Refresh summary after submit, keep alphabetical order
      const sumRes = await getOfferingSummaryApi(parseInt(selectedOffering));
      const summaryList = [...(sumRes.data.summary || [])].sort((a: any, b: any) =>
        a.student.full_name.localeCompare(b.student.full_name),
      );
      setSummary(summaryList);
    } catch (err: any) {
      const detail =
        err?.response?.data?.error ??
        err?.response?.data?.detail ??
        (typeof err?.response?.data === "string" ? err.response.data : null) ??
        err?.message ??
        "Unknown error";
      toast.error(`Failed to submit attendance. ${detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  const isReadyToLog = selectedOffering && students.length > 0;

  // Build a summary lookup by student id for quick access
  const summaryById: Record<number, any> = {};
  summary.forEach((row: any) => {
    summaryById[row.student.id] = row;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 lg:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={eauLogo} alt="EAU" className="h-8 object-contain" />
          <h1 className="font-display text-base font-bold">Teacher Portal</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground hidden sm:block">
            {user?.first_name} {user?.last_name}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="p-3 lg:p-4 max-w-6xl mx-auto space-y-4">
        {/* Semester + Course selector */}
        <Card className="shadow-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Select Class</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Semester
                </p>
                <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesters.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.label} {s.is_current ? "✓" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Your Assigned Course
                </p>
                <Select
                  value={selectedOffering}
                  onValueChange={setSelectedOffering}
                  disabled={!selectedSemester || loadingOfferings}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingOfferings
                          ? "Loading your courses..."
                          : myOfferings.length === 0 && selectedSemester
                            ? "No courses assigned this semester"
                            : "Select course"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {myOfferings.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.course_name} — {o.programme_name} · Yr {o.section_year} · Sec{" "}
                        {o.section_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {myOfferings.length === 0 && selectedSemester && !loadingOfferings && (
                  <p className="text-xs text-destructive mt-1">
                    No courses assigned to you for this semester. Ask the admin to assign
                    you to a course offering.
                  </p>
                )}
              </div>
            </div>

            {currentOffering && (
              <div className="mt-4 p-4 rounded-lg bg-muted/40 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">School</span>
                    <p className="font-medium">{currentOffering.programme_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Section</span>
                    <p className="font-medium">
                      Section {currentOffering.section_name} · Year {currentOffering.section_year}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Course Code</span>
                    <p className="font-medium">{currentOffering.course_code || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Credit Hours</span>
                    <p className="font-medium">{currentOffering.total_credit_hours} hrs</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Semester</span>
                    <p className="font-medium">{currentOffering.semester_label}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {currentOffering && (
              <div className="mt-6 flex flex-wrap gap-3 justify-end border-t border-border/50 pt-4">
                <Button
                  onClick={() => setImportOpen(true)}
                  variant="outline"
                  className="gap-2 flex-1 sm:flex-none border-border"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Import Excel
                </Button>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-1 sm:flex-none shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Log Attendance
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        {isReadyToLog && currentOffering && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{students.length}</p>
                  <p className="text-xs text-muted-foreground">
                    Section {currentOffering.section_name} Students
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-eau-mustard-light">
                  <ClipboardList className="w-5 h-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{summary.length}</p>
                  <p className="text-xs text-muted-foreground">Student Records</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-eau-crimson-light">
                  <BookOpen className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">
                    {currentOffering.total_credit_hours}
                  </p>
                  <p className="text-xs text-muted-foreground">Credit Hours</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Student Roster + Attendance Summary — both alphabetical, summary shows ALL students */}
        {isReadyToLog && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Roster */}
            <Card className="shadow-card border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">Student Roster</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>University ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((s, i) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs font-mono">
                          {s.student_id}
                        </TableCell>
                      </TableRow>
                    ))}
                    {students.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No students found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Attendance Summary — always shows ALL roster students alphabetically */}
            <Card className="shadow-card border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">Attendance Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Attended</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((s) => {
                      const row = summaryById[s.id];
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium text-sm">{s.full_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row ? `${row.attended_hours} hrs` : "0 hrs"}
                          </TableCell>
                          <TableCell>
                            {row ? (
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  row.status === "safe"
                                    ? "bg-primary/10 text-primary border-primary/30"
                                    : row.status === "warning"
                                      ? "bg-secondary/20 text-secondary-foreground border-secondary/30"
                                      : "bg-destructive/10 text-destructive border-destructive/30"
                                }`}
                              >
                                {row.status === "safe"
                                  ? "Safe"
                                  : row.status === "warning"
                                    ? "Warning"
                                    : "At Risk"}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs bg-muted text-muted-foreground border-border"
                              >
                                No data
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {students.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No students found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {!isReadyToLog && (
          <div className="flex flex-col items-center justify-center py-10 lg:py-16 text-center px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative w-20 h-20 mb-4">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent rounded-2xl rotate-6 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-br from-eau-crimson-light/40 to-eau-mustard-light/40 rounded-2xl -rotate-3 pointer-events-none" />
              <div className="relative flex items-center justify-center w-full h-full bg-card border border-border shadow-sm rounded-[14px] transition-transform hover:scale-105 duration-300">
                <BookOpen className="w-8 h-8 text-primary" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground mb-2">
              {user?.first_name ? `Welcome, ${user?.first_name}!` : "Welcome to Teacher Portal"}
            </h2>
            <p className="text-muted-foreground text-sm lg:text-base mb-6 max-w-sm">
              Select a semester to see your assigned courses, then pick a course to start logging
              attendance.
            </p>
            <div className="inline-flex items-center gap-2 text-xs lg:text-sm font-medium text-muted-foreground bg-muted/40 backdrop-blur-sm px-4 py-2 rounded-full border border-border/60 shadow-sm">
              <span className="text-foreground/80">Semester</span>
              <span className="text-muted-foreground/40">→</span>
              <span className="text-foreground/80">Your Course</span>
              <span className="text-muted-foreground/40">→</span>
              <span className="text-foreground/80">Log Attendance</span>
            </div>
          </div>
        )}
      </main>

      {/* Log Attendance Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="font-display">Log Attendance</DialogTitle>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full border">
              <Clock className="w-4 h-4 text-primary" />
              {liveTime}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">
                  Date
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-[300px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">{s.full_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {(["present", "late", "excused", "absent"] as AttendanceStatus[]).map(
                          (status) => (
                            <button
                              key={status}
                              onClick={() =>
                                setAttendanceMap((prev) => ({ ...prev, [s.id]: status }))
                              }
                              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                attendanceMap[s.id] === status
                                  ? status === "present"
                                    ? "bg-green-100 text-green-700 border-green-300"
                                    : status === "late"
                                      ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                                      : status === "excused"
                                        ? "bg-blue-100 text-blue-700 border-blue-300"
                                        : "bg-red-100 text-red-700 border-red-300"
                                  : "bg-background text-muted-foreground border-border hover:bg-muted"
                              }`}
                            >
                              {statusLabels[status]}
                            </button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                      No students found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="pt-4 border-t border-border flex justify-end gap-3 mt-auto">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || students.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? "Submitting..." : "Submit Attendance"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance Import Modal */}
      {currentOffering && (
        <AttendanceImportModal
          open={importOpen}
          onClose={() => {
            setImportOpen(false);
            // Refresh summary and students when import modal closes, in case records were added
            const offeringId = parseInt(selectedOffering);
            if (offeringId) {
              Promise.all([
                getOfferingStudentsApi(offeringId),
                getOfferingSummaryApi(offeringId),
              ]).then(([studRes, sumRes]) => {
                const studentList = sortAlpha(studRes.data.students || []);
                setStudents(studentList);
                const summaryList = [...(sumRes.data.summary || [])].sort((a: any, b: any) =>
                  a.student.full_name.localeCompare(b.student.full_name),
                );
                setSummary(summaryList);
              });
            }
          }}
          offering={{
            id: currentOffering.id,
            course_name: currentOffering.course_name,
            section_name: currentOffering.section_name,
            section_year: currentOffering.section_year,
            programme_name: currentOffering.programme_name
          }}
        />
      )}
    </div>
  );
};

export default TeacherDashboard;