import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Send, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { getAtRiskApi, getSemestersApi, sendAtRiskNotificationsApi } from "@/api/axios";

interface SemesterOption {
  id: number;
  label: string;
  is_current?: boolean;
}

interface AtRiskStudent {
  student_pk: number;
  offering_id: number;
  student_id: string;
  student_name: string;
  course_name: string;
  section: string;
  programme: string;
  attended_hours: number;
  missed_hours: number;
  attendance_percentage: number;
  projected_final_percentage?: number;
  risk_status?: "at_risk" | "cannot_sit_final";
  display_status?: string;
  minimum_required: number;
}

interface AtRiskTableProps {
  semesterId?: number;
  fullPage?: boolean;
  scopeParams?: Record<string, any>;
}

const AtRiskTable = ({ semesterId, fullPage = false, scopeParams = {} }: AtRiskTableProps) => {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(semesterId ? String(semesterId) : "");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    setSelectedSemesterId(semesterId ? String(semesterId) : "");
  }, [semesterId]);

  useEffect(() => {
    const handleImported = (event: Event) => {
      const customEvent = event as CustomEvent<{ semesterId?: number }>;
      if (customEvent.detail?.semesterId) {
        setSelectedSemesterId(String(customEvent.detail.semesterId));
      }
    };

    window.addEventListener("attendance-imported", handleImported);
    return () => window.removeEventListener("attendance-imported", handleImported);
  }, []);

  useEffect(() => {
    const fetchSemesters = async () => {
      try {
        const res = await getSemestersApi();
        const list = Array.isArray(res.data) ? res.data : [];
        setSemesters(list);
      } catch (e) {
        console.error(e);
      }
    };
    fetchSemesters();
  }, []);

  useEffect(() => {
    const fetchAtRisk = async () => {
      try {
        setLoading(true);
        const params: Record<string, any> = { ...scopeParams };
        const semesterFilter = selectedSemesterId ? Number(selectedSemesterId) : semesterId;
        if (semesterFilter) params.semester = semesterFilter;
        const res = await getAtRiskApi(params);
        setStudents(res.data.students || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAtRisk();
  }, [semesterId, selectedSemesterId, JSON.stringify(scopeParams)]);

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      s.student_name.toLowerCase().includes(q) ||
      s.student_id.toLowerCase().includes(q) ||
      s.course_name.toLowerCase().includes(q);
    const status = s.risk_status === "cannot_sit_final"
      ? "cannot-sit-final"
      : s.risk_status === "at_risk"
        ? "at-risk"
        : s.attendance_percentage < 85
          ? "at-risk"
          : "safe";
    const matchesStatus = filterStatus === "all" || status === filterStatus;
    return matchesSearch && matchesStatus;
  });
  const display = fullPage ? filteredStudents : filteredStudents.slice(0, 5);

  const handleBulkNotify = async () => {
    if (filteredStudents.length === 0) {
      toast.info("No students to notify.");
      return;
    }
    const toastId = toast.loading("Sending notifications...");
    try {
      const payload = {
        notifications: filteredStudents.map(s => ({
          student_pk: s.student_pk,
          offering_id: s.offering_id
        }))
      };
      await sendAtRiskNotificationsApi(payload);
      toast.success(`Successfully sent ${filteredStudents.length} notifications!`, { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Failed to send bulk notifications.", { id: toastId });
    }
  };

  const handleNotify = async (student: AtRiskStudent) => {
    const toastId = toast.loading(`Notifying ${student.student_name}...`);
    try {
      await sendAtRiskNotificationsApi({
        notifications: [{ student_pk: student.student_pk, offering_id: student.offering_id }]
      });
      toast.success(`Successfully notified ${student.student_name}!`, { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error(`Failed to notify ${student.student_name}.`, { id: toastId });
    }
  };

  return (
    <Card className="shadow-card border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <CardTitle className="font-display text-base">
            At-Risk Students
          </CardTitle>
          {!loading && (
            <span className="text-xs text-muted-foreground">
              ({students.length} total)
            </span>
          )}
        </div>
        <button
          onClick={handleBulkNotify}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <Send className="w-3.5 h-3.5" /> Bulk Notify
        </button>
      </CardHeader>
      <div className="px-4 pb-3 flex flex-wrap gap-3 items-center">
        <label className="text-xs text-muted-foreground whitespace-nowrap">
          Semester
        </label>
        <select
          value={selectedSemesterId}
          onChange={(e) => setSelectedSemesterId(e.target.value)}
          className="py-1.5 px-3 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring min-w-[220px]"
        >
          {semesters.map((semester) => (
            <option key={semester.id} value={semester.id}>
              {semester.label}{semester.is_current ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>
      {/* Search + filter bar */}
      <div className="px-4 pb-3 pt-2 border-b border-border flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student, course…"
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="py-1.5 px-3 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All statuses</option>
          <option value="at-risk">At Risk</option>
          <option value="cannot-sit-final">Cannot Sit Final Exam</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredStudents.length} student{filteredStudents.length !== 1 ? "s" : ""}
        </span>
      </div>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-y border-border bg-muted/30">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                Student
              </th>
              <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                Course
              </th>
              <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                Attendance
              </th>
              <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                Status
              </th>
              <th className="text-right px-6 py-3 font-medium text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && display.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground"
                >
                  No at-risk students 🎉
                </td>
              </tr>
            )}
            {display.map((s, i) => {
              const pct = s.attendance_percentage;
              const projectedPct = s.projected_final_percentage ?? pct;
              const isBlocked = s.risk_status === "cannot_sit_final";
              const statusLabel = s.display_status || (isBlocked ? "Cannot Sit Final Exam" : "At Risk");
              return (
                <tr
                  key={`${s.student_id}-${i}`}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium">{s.student_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {s.student_id}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <p>{s.course_name}</p>
                    <p className="text-xs text-muted-foreground/60">
                      {s.programme} · Sec {s.section}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isBlocked ? "bg-destructive" : "bg-secondary"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Best possible final: {projectedPct}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Min: {s.minimum_required} hrs
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        isBlocked
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleNotify(s)}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Notify
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

export default AtRiskTable;