import AttendanceImportModal from "@/components/admin/AttendanceImportModal";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BookOpen,
  ClipboardList,
  Users,
  LogOut,
  Plus,
  Clock,
  FileSpreadsheet,
  Calendar,
  Search,
  Filter,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import eauLogo from "@/assets/eau-logo.png";
import {
  getSemestersApi,
  getOfferingsApi,
  getOfferingStudentsApi,
  getOfferingSummaryApi,
  getAttendanceApi,
  submitAttendanceApi,
  deleteAttendanceRecordApi,
  bulkDeleteAttendanceRecordsApi,
  updateAttendanceRecordApi,
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

const statusStyles: Record<string, string> = {
  present: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  late: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  excused: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  absent: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
};

const sortAlpha = (list: Student[]) =>
  [...list].sort((a, b) => a.full_name.localeCompare(b.full_name));

export default function TeacherDashboard() {
  const { signOut, user } = useAuth();

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState("");

  const [myOfferings, setMyOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState("");
  const [loadingOfferings, setLoadingOfferings] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState("logs");

  // Filters for Attendance History Log
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Log Attendance Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [sessionHours, setSessionHours] = useState("1.5");
  const [sessionType, setSessionType] = useState("theory");
  const [attendanceMap, setAttendanceMap] = useState<Record<number, AttendanceStatus>>({});
  const [commentMap, setCommentMap] = useState<Record<number, string>>({});
  const [liveTime, setLiveTime] = useState(
    format(new Date(), "hh:mm:ss aa").toUpperCase(),
  );

  // Edit / Delete Record State
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editStatus, setEditStatus] = useState<string>("present");
  const [editHours, setEditHours] = useState<string>("1.5");
  const [updatingRecord, setUpdatingRecord] = useState(false);
  const [deleteSessionDate, setDeleteSessionDate] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

  // Live Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(format(new Date(), "hh:mm:ss aa").toUpperCase());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load Semesters
  useEffect(() => {
    getSemestersApi().then((res) => {
      const sems = res.data || [];
      setSemesters(sems);
      const current = sems.find((s: Semester) => s.is_current);
      if (current) setSelectedSemester(String(current.id));
      else if (sems.length > 0) setSelectedSemester(String(sems[0].id));
    });
  }, []);

  // Load Teacher Offerings
  useEffect(() => {
    if (!selectedSemester) return;
    setLoadingOfferings(true);
    setMyOfferings([]);
    setSelectedOffering("");
    setStudents([]);
    setSummary([]);
    setAttendanceRecords([]);
    getOfferingsApi({ semester: parseInt(selectedSemester) })
      .then((res) => setMyOfferings(res.data || []))
      .catch(() => setMyOfferings([]))
      .finally(() => setLoadingOfferings(false));
  }, [selectedSemester]);

  // Fetch all data for selected offering
  const refreshOfferingData = async (offeringId: number) => {
    try {
      setLoadingLogs(true);
      const [studRes, sumRes, attRes] = await Promise.all([
        getOfferingStudentsApi(offeringId),
        getOfferingSummaryApi(offeringId),
        getAttendanceApi({ offering: offeringId }),
      ]);

      const studentList = sortAlpha(studRes.data.students || []);
      setStudents(studentList);

      const summaryList = [...(sumRes.data.summary || [])].sort((a: any, b: any) =>
        a.student.full_name.localeCompare(b.student.full_name),
      );
      setSummary(summaryList);
      setAttendanceRecords(attRes.data || []);

      // Default attendance map for new submission
      const defaults: Record<number, AttendanceStatus> = {};
      studentList.forEach((s: Student) => {
        defaults[s.id] = "present";
      });
      setAttendanceMap(defaults);
      setCommentMap({});
    } catch (e) {
      console.error(e);
      toast.error("Failed to load class attendance data");
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!selectedOffering) return;
    refreshOfferingData(parseInt(selectedOffering));
    setFilterDate("all");
    setFilterStatus("all");
    setSearchQuery("");
  }, [selectedOffering]);

  useEffect(() => {
    const handleImported = (e: any) => {
      if (e?.detail?.semesterId && String(e.detail.semesterId) !== selectedSemester) {
        setSelectedSemester(String(e.detail.semesterId));
      }
      if (e?.detail?.offeringId) {
        setSelectedOffering(String(e.detail.offeringId));
        refreshOfferingData(Number(e.detail.offeringId));
      } else if (selectedOffering) {
        refreshOfferingData(parseInt(selectedOffering));
      }
    };
    window.addEventListener("attendance-imported", handleImported);
    return () => window.removeEventListener("attendance-imported", handleImported);
  }, [selectedSemester, selectedOffering]);

  const currentOffering = myOfferings.find(
    (o) => o.id === parseInt(selectedOffering),
  );

  // Distinct dates for the date filter dropdown
  const recordedDates = useMemo(() => {
    const datesSet = new Set<string>();
    attendanceRecords.forEach((r) => {
      if (r.date) datesSet.add(r.date);
    });
    return Array.from(datesSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [attendanceRecords]);

  // Filtered Attendance Records
  const filteredAttendance = useMemo(() => {
    return attendanceRecords.filter((r) => {
      if (filterDate !== "all" && r.date !== filterDate) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (r.student_name || "").toLowerCase().includes(q);
        const idMatch = (r.student_id || "").toLowerCase().includes(q);
        if (!nameMatch && !idMatch) return false;
      }
      return true;
    });
  }, [attendanceRecords, filterDate, filterStatus, searchQuery]);

  // Handle Mark All Present
  const handleMarkAllPresent = () => {
    const map: Record<number, AttendanceStatus> = {};
    students.forEach((s) => {
      map[s.id] = "present";
    });
    setAttendanceMap(map);
    toast.info("Marked all students as Present");
  };

  // Submit Attendance
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
      toast.success(`Attendance submitted for ${attendanceDate}!`);
      setDialogOpen(false);
      refreshOfferingData(parseInt(selectedOffering));
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

  // Delete Single Record
  const handleDeleteRecord = async (recordId: number, studentName: string) => {
    if (!confirm(`Delete attendance record for ${studentName}?`)) return;
    try {
      await deleteAttendanceRecordApi(recordId);
      toast.success(`Deleted attendance record for ${studentName}`);
      setAttendanceRecords((prev) => prev.filter((r) => r.id !== recordId));
      if (selectedOffering) {
        getOfferingSummaryApi(parseInt(selectedOffering)).then((sumRes) => {
          setSummary(sumRes.data.summary || []);
        });
      }
    } catch (e) {
      toast.error("Failed to delete record");
    }
  };

  // Delete Session for a Date
  const handleDeleteSession = async () => {
    if (!deleteSessionDate || !selectedOffering) return;
    setDeletingSession(true);
    try {
      const recordsToDelete = attendanceRecords.filter((r) => r.date === deleteSessionDate);
      const ids = recordsToDelete.map((r) => r.id);
      await bulkDeleteAttendanceRecordsApi(ids);
      toast.success(`Deleted all attendance records for ${deleteSessionDate}`);
      setAttendanceRecords((prev) => prev.filter((r) => r.date !== deleteSessionDate));
      setDeleteSessionDate(null);
      getOfferingSummaryApi(parseInt(selectedOffering)).then((sumRes) => {
        setSummary(sumRes.data.summary || []);
      });
    } catch (e) {
      toast.error("Failed to delete session");
    } finally {
      setDeletingSession(false);
    }
  };

  // Update Record
  const handleUpdateRecord = async () => {
    if (!editingRecord) return;
    setUpdatingRecord(true);
    try {
      await updateAttendanceRecordApi(editingRecord.id, {
        status: editStatus,
        hours_attended: parseFloat(editHours) || 1.5,
      });
      toast.success(`Updated attendance for ${editingRecord.student_name}`);
      setAttendanceRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id
            ? { ...r, status: editStatus, hours_attended: parseFloat(editHours) || 1.5 }
            : r
        )
      );
      setEditingRecord(null);
      if (selectedOffering) {
        getOfferingSummaryApi(parseInt(selectedOffering)).then((sumRes) => {
          setSummary(sumRes.data.summary || []);
        });
      }
    } catch (e) {
      toast.error("Failed to update record");
    } finally {
      setUpdatingRecord(false);
    }
  };

  const isReady = selectedOffering && students.length > 0;

  // Stats calculation
  const totalSessionsConducted = recordedDates.length;
  const atRiskCount = summary.filter((s) => s.status === "at_risk").length;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-background text-foreground pb-12">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b px-4 lg:px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src={eauLogo} alt="EAU" className="h-8 object-contain" />
          <div>
            <h1 className="font-bold text-base tracking-tight leading-none">Teacher Portal</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attendance Recording & Course Monitoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground hidden sm:block">
            {user?.first_name} {user?.last_name} ({user?.username})
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-xs">
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
        {/* Class Selector Card */}
        <Card className="shadow-card border-border/60">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">Select Class</CardTitle>
                <CardDescription className="text-xs">
                  Choose your semester and assigned course offering.
                </CardDescription>
              </div>
              {isReady && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportOpen(true)}
                    className="gap-1.5 text-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Import Excel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setDialogOpen(true)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 text-xs shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log Attendance
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Semester
                </label>
                <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesters.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.label} {s.is_current ? "✓ (Current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Assigned Course Offering
                </label>
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
                        {o.course_name} — {o.programme_name} · Yr {o.section_year} · Sec {o.section_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {currentOffering && (
              <div className="p-3.5 rounded-xl bg-muted/40 border flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <div>
                    <span className="text-muted-foreground">Programme:</span>{" "}
                    <strong className="text-foreground">{currentOffering.programme_name}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Section:</span>{" "}
                    <strong className="text-foreground">
                      {currentOffering.section_name} (Year {currentOffering.section_year})
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Code:</span>{" "}
                    <strong className="text-foreground font-mono">{currentOffering.course_code || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Credit Hours:</span>{" "}
                    <strong className="text-foreground">{currentOffering.total_credit_hours} hrs</strong>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top KPIs if course is selected */}
        {isReady && currentOffering && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Enrolled Students
                  </p>
                  <p className="text-3xl font-extrabold tracking-tight mt-1">{students.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sessions Conducted
                  </p>
                  <p className="text-3xl font-extrabold tracking-tight mt-1">{totalSessionsConducted}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Records Logged
                  </p>
                  <p className="text-3xl font-extrabold tracking-tight mt-1">{attendanceRecords.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card border-border/60">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Students At Risk
                  </p>
                  <p className={`text-3xl font-extrabold tracking-tight mt-1 ${atRiskCount > 0 ? "text-rose-600" : ""}`}>
                    {atRiskCount}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${atRiskCount > 0 ? "bg-rose-500/10 text-rose-600" : "bg-muted text-muted-foreground"}`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabbed Views */}
        {isReady && currentOffering ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-muted/60 p-1 rounded-xl">
              <TabsTrigger value="logs" className="gap-2 text-xs font-semibold">
                <Calendar className="w-3.5 h-3.5" />
                Attendance History & Date Search ({attendanceRecords.length})
              </TabsTrigger>
              <TabsTrigger value="summary" className="gap-2 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Cumulative Student Summary ({summary.length})
              </TabsTrigger>
              <TabsTrigger value="roster" className="gap-2 text-xs font-semibold">
                <Users className="w-3.5 h-3.5" />
                Class Roster ({students.length})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Attendance History & Daily Logs with Date Filter */}
            <TabsContent value="logs" className="space-y-4">
              <Card className="shadow-card border-border/60">
                <CardHeader className="pb-3 border-b">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold">Class Attendance Logs</CardTitle>
                      <CardDescription className="text-xs">
                        Filter and search attendance records by specific date, student name, or status.
                      </CardDescription>
                    </div>

                    {/* Filters Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Date Filter Dropdown */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <select
                          value={filterDate}
                          onChange={(e) => setFilterDate(e.target.value)}
                          className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring font-medium"
                        >
                          <option value="all">All Dates ({recordedDates.length} days)</option>
                          {recordedDates.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status Filter */}
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring font-medium"
                      >
                        <option value="all">All Statuses</option>
                        <option value="present">Present</option>
                        <option value="late">Late</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused</option>
                      </select>

                      {/* Search Box */}
                      <div className="relative w-44">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                        <Input
                          placeholder="Search student..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>

                      {/* Delete Session Button (if a specific date is filtered) */}
                      {filterDate !== "all" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteSessionDate(filterDate)}
                          className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Day ({filterDate})
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {loadingLogs ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Loading attendance records...
                    </div>
                  ) : filteredAttendance.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No attendance records found matching your filters.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead className="text-xs font-semibold w-12">#</TableHead>
                            <TableHead className="text-xs font-semibold">Student</TableHead>
                            <TableHead className="text-xs font-semibold">Date</TableHead>
                            <TableHead className="text-xs font-semibold">Type</TableHead>
                            <TableHead className="text-xs font-semibold">Hours</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-right text-xs font-semibold w-24">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y">
                          {filteredAttendance.map((r, i) => (
                            <TableRow key={r.id || i} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="py-2.5">
                                <p className="font-medium text-xs">{r.student_name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{r.student_id}</p>
                              </TableCell>
                              <TableCell className="text-xs font-mono font-medium">{r.date}</TableCell>
                              <TableCell className="text-xs text-muted-foreground capitalize">
                                {r.session_type || "theory"}
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                {parseFloat(r.hours_attended || 1.5).toFixed(1)} hrs
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-xs font-semibold px-2 py-0.5 capitalize ${statusStyles[r.status] || ""}`}
                                >
                                  {statusLabels[r.status] || r.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingRecord(r);
                                      setEditStatus(r.status);
                                      setEditHours(String(r.hours_attended || "1.5"));
                                    }}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title="Edit Status"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteRecord(r.id, r.student_name)}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600"
                                    title="Delete Record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: Cumulative Student Summary */}
            <TabsContent value="summary" className="space-y-4">
              <Card className="shadow-card border-border/60">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-bold">Course Attendance Summary</CardTitle>
                  <CardDescription className="text-xs">
                    Cumulative student totals, attendance percentage, and eligibility standing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-xs font-semibold">Student</TableHead>
                          <TableHead className="text-xs font-semibold">Attended Hours</TableHead>
                          <TableHead className="text-xs font-semibold">Missed Hours</TableHead>
                          <TableHead className="text-xs font-semibold">Attendance Rate</TableHead>
                          <TableHead className="text-right text-xs font-semibold">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y">
                        {students.map((s) => {
                          const row = summary.find((item: any) => item.student?.id === s.id);
                          return (
                            <TableRow key={s.id} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="py-2.5">
                                <p className="font-medium text-xs">{s.full_name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{s.student_id}</p>
                              </TableCell>
                              <TableCell className="text-xs font-semibold">
                                {row ? `${parseFloat(row.attended_hours || 0).toFixed(1)} hrs` : "0.0 hrs"}
                              </TableCell>
                              <TableCell className="text-xs text-rose-600 font-semibold">
                                {row ? `${parseFloat(row.missed_hours || 0).toFixed(1)} hrs` : "0.0 hrs"}
                              </TableCell>
                              <TableCell className="text-xs font-bold">
                                {row ? `${row.attendance_percentage}%` : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {row ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-xs font-semibold px-2.5 py-0.5 ${
                                      row.status === "safe"
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                        : row.status === "warning"
                                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                        : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                    }`}
                                  >
                                    {row.status === "safe" ? "Safe" : row.status === "warning" ? "Warning" : "At Risk"}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                                    No data
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: Student Roster */}
            <TabsContent value="roster" className="space-y-4">
              <Card className="shadow-card border-border/60">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base font-bold">Student Class Roster</CardTitle>
                  <CardDescription className="text-xs">
                    All students enrolled in Section {currentOffering.section_name}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-xs font-semibold w-12">#</TableHead>
                        <TableHead className="text-xs font-semibold">Student Name</TableHead>
                        <TableHead className="text-xs font-semibold">University ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y">
                      {students.map((s, i) => (
                        <TableRow key={s.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-xs font-medium">{s.full_name}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{s.student_id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <BookOpen className="w-8 h-8" />
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight mb-1">
              Welcome, {user?.first_name || "Instructor"}!
            </h2>
            <p className="text-muted-foreground text-xs max-w-sm">
              Select your semester and assigned course offering above to view student rosters, attendance history, and log attendance.
            </p>
          </div>
        )}
      </main>

      {/* Log Attendance Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-3">
            <div>
              <DialogTitle className="font-bold text-base">Log Class Attendance</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentOffering?.course_name} — Section {currentOffering?.section_name}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full border">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {liveTime}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-4">
            {/* Session Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-muted/30 border">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-full border border-input rounded-lg px-2.5 py-1.5 text-xs bg-background outline-none focus:ring-2 focus:ring-ring font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Session Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="8"
                  value={sessionHours}
                  onChange={(e) => setSessionHours(e.target.value)}
                  className="w-full border border-input rounded-lg px-2.5 py-1.5 text-xs bg-background outline-none focus:ring-2 focus:ring-ring font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Session Type
                </label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="w-full border border-input rounded-lg px-2.5 py-1.5 text-xs bg-background outline-none focus:ring-2 focus:ring-ring font-medium"
                >
                  <option value="theory">Theory</option>
                  <option value="practical">Practical / Lab</option>
                </select>
              </div>
            </div>

            {/* Quick action: Mark all present */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Student Attendance ({students.length})
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllPresent}
                className="h-7 text-xs gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-50"
              >
                <Check className="w-3.5 h-3.5" /> Mark All Present
              </Button>
            </div>

            {/* Student list */}
            <div className="border rounded-xl overflow-hidden divide-y">
              {students.map((s) => (
                <div key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/20 transition-colors">
                  <div>
                    <p className="font-semibold text-xs text-foreground">{s.full_name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{s.student_id}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(["present", "late", "excused", "absent"] as AttendanceStatus[]).map((status) => {
                      const isSelected = attendanceMap[s.id] === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setAttendanceMap((prev) => ({ ...prev, [s.id]: status }))}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                            isSelected
                              ? status === "present"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                : status === "late"
                                ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                : status === "excused"
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-rose-600 text-white border-rose-600 shadow-sm"
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {statusLabels[status]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="border-t pt-3 flex justify-between items-center">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || students.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
            >
              {submitting ? "Submitting..." : "Submit Attendance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Single Record Modal */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold text-base flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-primary" />
              Edit Student Attendance
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 p-3 rounded-lg border text-xs space-y-1">
              <p><strong>Student:</strong> {editingRecord?.student_name} ({editingRecord?.student_id})</p>
              <p><strong>Date:</strong> {editingRecord?.date}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="excused">Excused</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Hours
              </label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="8"
                value={editHours}
                onChange={(e) => setEditHours(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRecord(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRecord} disabled={updatingRecord} className="bg-primary hover:bg-primary/90">
              {updatingRecord ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Day Confirmation Dialog */}
      <Dialog open={!!deleteSessionDate} onOpenChange={(open) => !open && setDeleteSessionDate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-bold text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Delete Day's Attendance Log
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              Are you sure you want to delete all attendance records for date:{" "}
              <strong className="text-foreground">{deleteSessionDate}</strong>?
            </p>
            <p className="text-xs text-destructive">
              This will permanently remove the log for this day and recalculate student percentages.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSessionDate(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSession} disabled={deletingSession} className="gap-1.5">
              <Trash2 className="w-4 h-4" />
              {deletingSession ? "Deleting..." : "Delete Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance Import Excel Modal */}
      {currentOffering && (
        <AttendanceImportModal
          open={importOpen}
          onClose={() => {
            setImportOpen(false);
            if (selectedOffering) {
              refreshOfferingData(parseInt(selectedOffering));
            }
          }}
          onSuccess={() => {
            if (selectedOffering) {
              refreshOfferingData(parseInt(selectedOffering));
            }
          }}
          offering={{
            id: currentOffering.id,
            course_name: currentOffering.course_name,
            section_name: currentOffering.section_name,
            section_year: currentOffering.section_year,
            programme_name: currentOffering.programme_name,
            teacher: user?.id,
            teacher_name:
              user?.full_name ||
              `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
              user?.username,
          }}
          initialTeacherId={user?.id}
        />
      )}
    </div>
  );
}