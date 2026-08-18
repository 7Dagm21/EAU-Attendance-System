import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getStudentsApi,
  getAttendanceApi,
  getOfferingsApi,
  getSemestersApi,
  downloadStudentReportApi,
} from "@/api/axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  LogOut,
  ClipboardList,
  AlertTriangle,
  CheckCircle,
  Mail,
  Download,
  BookOpen,
  Clock,
  AlertCircle,
  CheckCircle2,
  Filter,
  Calendar,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import eauLogo from "@/assets/eau-logo.png";

const statusColors: Record<string, string> = {
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

export default function StudentDashboard() {
  const { signOut, user } = useAuth();
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [currentSemester, setCurrentSemester] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Table filters
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const semRes = await getSemestersApi({ current: true });
        const currentSem = semRes.data?.[0];
        setCurrentSemester(currentSem);
        const semId = currentSem?.id;

        const [attendanceRes, offeringsRes, studentRes] = await Promise.all([
          getAttendanceApi(semId ? { semester: semId } : {}),
          getOfferingsApi(semId ? { semester: semId } : {}),
          getStudentsApi(),
        ]);

        setRecords(attendanceRes.data || []);
        setOfferings(offeringsRes.data || []);
        if (studentRes.data && studentRes.data.length > 0) {
          setStudentProfile(studentRes.data[0]);
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Detailed per-course calculations
  const courseSummaries = useMemo(() => {
    return offerings.map((offering) => {
      const courseRecords = records.filter(
        (r) =>
          r.course_offering === offering.id ||
          r.course_name === offering.course_name,
      );

      let presentHours = 0;
      let lateHours = 0;
      let lateCount = 0;
      let excusedHours = 0;
      let absentHours = 0;
      let absentCount = 0;

      courseRecords.forEach((r) => {
        const hrs = parseFloat(r.hours_attended) || 1.0;
        if (r.status === "present") {
          presentHours += hrs;
        } else if (r.status === "late") {
          lateHours += hrs;
          lateCount += 1;
        } else if (r.status === "excused") {
          excusedHours += hrs;
        } else if (r.status === "absent") {
          absentHours += hrs;
          absentCount += 1;
        }
      });

      // Late penalty: 0.5 hour deducted per late session
      const latePenalty = Math.min(lateHours, lateCount * 0.5);
      const earnedFromLate = Math.max(0, lateHours - latePenalty);
      const attendedHours = presentHours + earnedFromLate;

      const totalCreditHours = parseFloat(offering.total_credit_hours) || 48.0;
      const effectiveCredit = Math.max(1, totalCreditHours - excusedHours);
      const minimumRequiredHours = parseFloat(offering.minimum_required_hours) || (totalCreditHours * 0.85);

      const classesHeldHours = presentHours + lateHours + absentHours;
      const attendancePercentage =
        classesHeldHours > 0
          ? Math.round((attendedHours / classesHeldHours) * 1000) / 10
          : 100.0;

      const remainingPossibleHours = Math.max(0, effectiveCredit - classesHeldHours);
      const projectedFinalAttended = attendedHours + remainingPossibleHours;
      const projectedFinalPercentage =
        Math.round((projectedFinalAttended / effectiveCredit) * 1000) / 10;

      // Max allowed absence to maintain 85% requirement
      const maxAllowedAbsenceHours = Math.round(effectiveCredit * 0.15 * 10) / 10;
      const remainingAllowedAbsenceHours = Math.max(
        0,
        Math.round((maxAllowedAbsenceHours - absentHours) * 10) / 10,
      );

      // Determine risk level & advice
      let riskLevel: "safe" | "warning" | "at_risk" | "cannot_sit" = "safe";
      let adviceText = "";

      if (projectedFinalPercentage < 85.0 && classesHeldHours > 0) {
        riskLevel = "cannot_sit";
        adviceText = `Ineligible for Final Exam: Even with 100% future attendance, your best possible final attendance is ${projectedFinalPercentage}%, which is below the required 85%.`;
      } else if (attendancePercentage < 75.0 && classesHeldHours > 0) {
        riskLevel = "at_risk";
        adviceText = `Attendance is Critical (${attendancePercentage}%). You have accumulated ${absentHours.toFixed(1)} absent hours. You must attend all remaining sessions!`;
      } else if (attendancePercentage < 85.0 || absentHours >= maxAllowedAbsenceHours) {
        riskLevel = "warning";
        adviceText = `Warning: You are near the limit. You have ${absentHours.toFixed(1)} hrs of absence. You can only miss at most ${remainingAllowedAbsenceHours.toFixed(1)} more hours this semester.`;
      } else {
        riskLevel = "safe";
        adviceText = `Good Standing: You have attended ${attendedHours.toFixed(1)} of ${classesHeldHours.toFixed(1)} conducted hours. You can miss up to ${remainingAllowedAbsenceHours.toFixed(1)} more hours and maintain your 85% eligibility.`;
      }

      return {
        offeringId: offering.id,
        courseName: offering.course_name,
        courseCode: offering.course_code || "",
        sectionName: offering.section_name,
        teacherName: offering.teacher_name || offering.all_teachers_display || "Instructor",
        totalCreditHours,
        minimumRequiredHours,
        classesHeldHours,
        attendedHours,
        presentHours,
        lateHours,
        lateCount,
        excusedHours,
        absentHours,
        absentCount,
        attendancePercentage,
        projectedFinalPercentage,
        maxAllowedAbsenceHours,
        remainingAllowedAbsenceHours,
        riskLevel,
        adviceText,
      };
    });
  }, [offerings, records]);

  // Overall totals across all courses
  const overallStats = useMemo(() => {
    let totalHeld = 0;
    let totalAttended = 0;
    let totalAbsent = 0;
    let totalExcused = 0;
    let totalLate = 0;

    courseSummaries.forEach((c) => {
      totalHeld += c.classesHeldHours;
      totalAttended += c.attendedHours;
      totalAbsent += c.absentHours;
      totalExcused += c.excusedHours;
      totalLate += c.lateCount;
    });

    const percentage =
      totalHeld > 0
        ? Math.round((totalAttended / totalHeld) * 1000) / 10
        : 100.0;

    const hasCritical = courseSummaries.some(
      (c) => c.riskLevel === "cannot_sit" || c.riskLevel === "at_risk",
    );
    const hasWarning = courseSummaries.some((c) => c.riskLevel === "warning");

    let overallStatus: "safe" | "warning" | "at_risk" = "safe";
    if (hasCritical || percentage < 75.0) overallStatus = "at_risk";
    else if (hasWarning || percentage < 85.0) overallStatus = "warning";

    return {
      totalHeld,
      totalAttended,
      totalAbsent,
      totalExcused,
      totalLate,
      percentage,
      overallStatus,
    };
  }, [courseSummaries]);

  // Filtered attendance log records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterCourse !== "all") {
        if (
          String(r.course_offering) !== filterCourse &&
          r.course_name !== filterCourse
        )
          return false;
      }
      if (filterStatus !== "all" && r.status !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [records, filterCourse, filterStatus]);

  const handleDownloadReport = async () => {
    if (!studentProfile?.id) {
      toast.error("Student profile not loaded");
      return;
    }
    setDownloadingReport(true);
    try {
      await downloadStudentReportApi(studentProfile.id, {
        rpt_format: "pdf",
        semester: currentSemester?.id,
      });
      toast.success("Attendance Report downloaded!");
    } catch (e) {
      toast.error("Failed to generate report");
    } finally {
      setDownloadingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Loading your student portal...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-background text-foreground pb-12">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <img src={eauLogo} alt="EAU Logo" className="h-8 object-contain" />
          <div>
            <h1 className="font-bold text-base tracking-tight leading-none">
              EAU Student Attendance Portal
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentSemester?.academic_year_name || "Academic Year"} ·{" "}
              {currentSemester?.label || "Current Semester"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            className="gap-1.5 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            {downloadingReport ? "Generating..." : "Download Report"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Student Profile Banner */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold tracking-tight">
                {studentProfile?.first_name || user?.first_name}{" "}
                {studentProfile?.last_name || user?.last_name}
              </h2>
              <Badge variant="secondary" className="font-mono text-xs">
                {studentProfile?.student_id || user?.staff_id}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 pt-0.5">
              <span>{studentProfile?.programme_name || "Programme"}</span>
              {studentProfile?.department_name && (
                <>
                  <span>•</span>
                  <span>{studentProfile.department_name}</span>
                </>
              )}
              {studentProfile?.current_section && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-foreground">
                    Section {studentProfile.current_section.section_name} (Year{" "}
                    {studentProfile.current_section.year})
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Threshold:</span>
            <Badge className="bg-primary/20 text-primary border-primary/30 font-semibold text-xs">
              85% Minimum Required
            </Badge>
          </div>
        </div>

        {/* Top KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Overall Attendance */}
          <Card className="shadow-card border-border/60">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Overall Attendance
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold tracking-tight">
                    {overallStats.percentage}%
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    ({overallStats.totalAttended.toFixed(1)} / {overallStats.totalHeld.toFixed(1)} hrs)
                  </span>
                </div>
              </div>
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  overallStats.overallStatus === "safe"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : overallStats.overallStatus === "warning"
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-rose-500/10 text-rose-600"
                }`}
              >
                <ClipboardList className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Academic Standing */}
          <Card className="shadow-card border-border/60">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Eligibility Status
                </p>
                <div className="mt-1">
                  {overallStats.overallStatus === "safe" ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs px-2.5 py-0.5">
                      Exam Eligible (Safe)
                    </Badge>
                  ) : overallStats.overallStatus === "warning" ? (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs px-2.5 py-0.5">
                      Warning (Near Limit)
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-xs px-2.5 py-0.5">
                      At Risk (Attendance Low)
                    </Badge>
                  )}
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Absence Hours */}
          <Card className="shadow-card border-border/60">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Absences
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className={`text-3xl font-extrabold tracking-tight ${
                      overallStats.totalAbsent > 0 ? "text-rose-600 dark:text-rose-400" : ""
                    }`}
                  >
                    {overallStats.totalAbsent.toFixed(1)}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    hours missed
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Enrolled Courses */}
          <Card className="shadow-card border-border/60">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Enrolled Courses
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold tracking-tight">
                    {courseSummaries.length}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    courses active
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Course-by-Course Breakdown */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg">
                Course Attendance Breakdown & Progress
              </h3>
              <p className="text-xs text-muted-foreground">
                Track your attendance percentage and eligibility status for each course.
              </p>
            </div>
          </div>

          {courseSummaries.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No enrolled courses found for the current semester.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courseSummaries.map((c) => {
                const isSafe = c.riskLevel === "safe";
                const isWarning = c.riskLevel === "warning";
                const isAtRisk = c.riskLevel === "at_risk";
                const isCannotSit = c.riskLevel === "cannot_sit";

                const progressColor = isSafe
                  ? "bg-emerald-500"
                  : isWarning
                  ? "bg-amber-500"
                  : "bg-rose-500";

                return (
                  <Card
                    key={c.offeringId}
                    className="shadow-card border-border/60 overflow-hidden flex flex-col justify-between"
                  >
                    <CardHeader className="pb-3 border-b bg-muted/20">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base font-bold leading-tight">
                            {c.courseName}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.courseCode ? `${c.courseCode} · ` : ""}
                            {c.teacherName}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`font-semibold text-xs px-2 py-0.5 ${
                            isSafe
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : isWarning
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                          }`}
                        >
                          {isCannotSit
                            ? "Cannot Sit Final"
                            : isAtRisk
                            ? "At Risk"
                            : isWarning
                            ? "Warning"
                            : "Good Standing"}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 space-y-4 flex-1">
                      {/* Attendance % and Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Attendance Rate
                          </span>
                          <span className="text-xl font-bold">
                            {c.attendancePercentage}%
                          </span>
                        </div>

                        {/* Progress Bar Container with 85% Marker */}
                        <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{
                              width: `${Math.min(100, c.attendancePercentage)}%`,
                            }}
                          />
                        </div>

                        <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                          <span>Conducted: {c.classesHeldHours.toFixed(1)} hrs</span>
                          <span>Required: 85%</span>
                        </div>
                      </div>

                      {/* Detailed Metric Badges */}
                      <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                        <div className="bg-muted/40 p-2 rounded-lg border border-border/50">
                          <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                            Present
                          </span>
                          <span className="font-bold text-sm text-foreground">
                            {c.presentHours.toFixed(1)}h
                          </span>
                        </div>

                        <div className="bg-muted/40 p-2 rounded-lg border border-border/50">
                          <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                            Late
                          </span>
                          <span className="font-bold text-sm text-amber-600">
                            {c.lateCount} sess
                          </span>
                        </div>

                        <div className="bg-muted/40 p-2 rounded-lg border border-border/50">
                          <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                            Absent
                          </span>
                          <span className="font-bold text-sm text-rose-600">
                            {c.absentHours.toFixed(1)}h
                          </span>
                        </div>

                        <div className="bg-muted/40 p-2 rounded-lg border border-border/50">
                          <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                            Excused
                          </span>
                          <span className="font-bold text-sm text-blue-600">
                            {c.excusedHours.toFixed(1)}h
                          </span>
                        </div>
                      </div>

                      {/* Real-time Advice Alert Box */}
                      <div
                        className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                          isCannotSit || isAtRisk
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200"
                            : isWarning
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                        }`}
                      >
                        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-xs mb-0.5">
                            Attendance Progress Note
                          </p>
                          <p>{c.adviceText}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Detailed Attendance Log Table */}
        <Card className="shadow-card border-border/60">
          <CardHeader className="pb-3 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold">
                  My Attendance History Log
                </CardTitle>
                <CardDescription className="text-xs">
                  Review every recorded class session with full details.
                </CardDescription>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterCourse}
                  onChange={(e) => setFilterCourse(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Courses</option>
                  {offerings.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.course_name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No attendance logs found matching your selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Date</TableHead>
                      <TableHead className="text-xs font-semibold">Course</TableHead>
                      <TableHead className="text-xs font-semibold">Section</TableHead>
                      <TableHead className="text-xs font-semibold">Session</TableHead>
                      <TableHead className="text-xs font-semibold">Hours</TableHead>
                      <TableHead className="text-xs font-semibold text-right">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y">
                    {filteredRecords.map((r, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="text-xs font-mono font-medium py-3">
                          {r.date}
                        </TableCell>
                        <TableCell className="text-xs font-semibold py-3">
                          {r.course_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-3">
                          {r.section_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground capitalize py-3">
                          {r.session_type || "theory"}
                        </TableCell>
                        <TableCell className="text-xs font-medium py-3">
                          {parseFloat(r.hours_attended || 1).toFixed(1)} hrs
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Badge
                            variant="outline"
                            className={`text-xs font-semibold px-2.5 py-0.5 capitalize ${
                              statusColors[r.status] || ""
                            }`}
                          >
                            {statusLabels[r.status] || r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
