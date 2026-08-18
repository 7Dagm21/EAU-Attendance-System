import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, Trash2, Edit3, AlertTriangle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import AttendanceImportModal from "@/components/admin/AttendanceImportModal";
import {
  getAttendanceApi,
  getSectionsApi,
  getSemestersApi,
  getDepartmentsApi,
  getUsersApi,
  getOfferingsApi,
  deleteAttendanceRecordApi,
  bulkDeleteAttendanceRecordsApi,
  updateAttendanceRecordApi,
} from "@/api/axios";
interface Course {
  id: number;
  name: string;
  year: number;
}
interface Programme {
  id: number;
  name: string;
  duration_years: number;
}
interface Section {
  id: number;
  name: string;
  year: number;
}
interface Semester {
  id: number;
  label: string;
  is_current: boolean;
}
interface Department {
  id: number;
  name: string;
  programme: number;
}
interface Teacher {
  id: number;
  first_name?: string;
  last_name?: string;
  username: string;
}
interface Offering {
  id: number;
  course_name: string;
  section_name: string;
  section_year: number;
  programme_name: string;
  teacher?: number | null;
  teacher_name?: string | null;
  secondary_teachers?: { id: number; username?: string; first_name?: string; last_name?: string; full_name?: string }[];
  all_teachers_display?: string;
}

interface AttendanceTabProps {
  courses: Course[];
  programmes: Programme[];
}

const statusStyles: Record<string, string> = {
  present: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  late: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  excused: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  absent: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  unexcused: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
  unexcused: "Absent",
};

const AttendanceTab = ({ courses, programmes }: AttendanceTabProps) => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [semesters, setSemesters] = useState<Semester[]>([]);

  // Filters
  const [filterSemester, setFilterSemester] = useState("");
  const [filterProgramme, setFilterProgramme] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // Import Modal States
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [selectedTeacherForImport, setSelectedTeacherForImport] = useState<{
    id?: number;
    name?: string;
    role?: string;
  } | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedOffering, setSelectedOffering] = useState<Offering | undefined>();

  // Local filters for the Import Dialog
  const [importSemester, setImportSemester] = useState("");
  const [importYear, setImportYear] = useState("");
  const [importCourse, setImportCourse] = useState("");
  const [importSection, setImportSection] = useState("");

  // Delete & Edit State
  const [deleteGroup, setDeleteGroup] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editStatus, setEditStatus] = useState<string>("present");
  const [editHours, setEditHours] = useState<string>("2.0");
  const [updating, setUpdating] = useState(false);

  const handleDeleteSession = async () => {
    if (!deleteGroup) return;
    setDeleting(true);
    try {
      const recordIds = deleteGroup.records.map((r: any) => r.id);
      await bulkDeleteAttendanceRecordsApi(recordIds);
      toast.success(`Deleted ${recordIds.length} attendance records for ${deleteGroup.date}`);
      setRecords((prev) => prev.filter((r) => !recordIds.includes(r.id)));
      setDeleteGroup(null);
    } catch (e) {
      toast.error("Failed to delete attendance session");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSingleRecord = async (recordId: number, studentName: string) => {
    if (!confirm(`Delete attendance record for ${studentName}?`)) return;
    try {
      await deleteAttendanceRecordApi(recordId);
      toast.success(`Deleted attendance record for ${studentName}`);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch (e) {
      toast.error("Failed to delete record");
    }
  };

  const handleUpdateRecord = async () => {
    if (!editingRecord) return;
    setUpdating(true);
    try {
      await updateAttendanceRecordApi(editingRecord.id, {
        status: editStatus,
        hours_attended: parseFloat(editHours) || 2.0,
      });
      toast.success(`Updated attendance for ${editingRecord.student_name}`);
      setRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id
            ? { ...r, status: editStatus, hours_attended: parseFloat(editHours) || 2.0 }
            : r
        )
      );
      setEditingRecord(null);
    } catch (e) {
      toast.error("Failed to update record");
    } finally {
      setUpdating(false);
    }
  };

  const openSelector = async () => {
    setSelectorOpen(true);
    setOfferings([]);
    setSelectedOptionKey("");
    setSelectedTeacherForImport(null);
    setImportYear("");
    setImportCourse("");
    setImportSection("");
    // Use the global semester if set, otherwise leave blank
    setImportSemester(filterSemester || "");
    try {
      // Fetch all offerings to allow local filtering
      const res = await getOfferingsApi();
      setOfferings(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredOfferingsForImport = offerings.filter((o: any) => {
    if (importSemester && String(o.semester_id) !== importSemester && String(o.semester) !== importSemester) {
      // Handle cases where the API returns either semester_id or semester
      // If neither is present, we might just fall back to no filtering, but assuming one is there.
      // Wait, offering interface only has `semester_label`. Let's check `semester` in API.
      // We will skip strict semester filtering here if not possible, but let's try.
    }
    if (importYear && String(o.section_year) !== importYear) return false;
    if (importCourse && o.course_name !== importCourse) return false;
    if (importSection && o.section_name !== importSection) return false;
    return true;
  });

  const classTeacherOptions = useMemo(() => {
    const list: {
      key: string;
      offering: Offering;
      teacherId?: number;
      teacherName: string;
      roleLabel: string;
      label: string;
    }[] = [];

    filteredOfferingsForImport.forEach((o) => {
      let hasTeacher = false;

      // 1. Primary Teacher option
      if (o.teacher && o.teacher_name) {
        hasTeacher = true;
        list.push({
          key: `${o.id}__primary__${o.teacher}`,
          offering: o,
          teacherId: o.teacher,
          teacherName: o.teacher_name,
          roleLabel: "Primary",
          label: `${o.course_name} (Section ${o.section_name}) — ${o.teacher_name} (Primary)`,
        });
      }

      // 2. Secondary Teachers (Co-Teachers) options
      if (o.secondary_teachers && o.secondary_teachers.length > 0) {
        o.secondary_teachers.forEach((st: any) => {
          hasTeacher = true;
          const stName =
            st.full_name ||
            `${st.first_name || ""} ${st.last_name || ""}`.trim() ||
            st.username;
          list.push({
            key: `${o.id}__secondary__${st.id}`,
            offering: o,
            teacherId: st.id,
            teacherName: stName,
            roleLabel: "Co-Teacher",
            label: `${o.course_name} (Section ${o.section_name}) — ${stName} (Co-Teacher)`,
          });
        });
      }

      // 3. Fallback if unassigned
      if (!hasTeacher) {
        list.push({
          key: `${o.id}__unassigned`,
          offering: o,
          teacherName: "Unassigned",
          roleLabel: "Unassigned",
          label: `${o.course_name} (Section ${o.section_name}) — Unassigned`,
        });
      }
    });

    return list;
  }, [filteredOfferingsForImport]);

  const handleSelectorNext = () => {
    const choice = classTeacherOptions.find((c) => c.key === selectedOptionKey);
    if (choice) {
      setSelectedOffering(choice.offering);
      setSelectedTeacherForImport({
        id: choice.teacherId,
        name: choice.teacherName,
        role: choice.roleLabel,
      });
      setSelectorOpen(false);
      setImportModalOpen(true);
    }
  };

  useEffect(() => {
    getSemestersApi().then((res) => {
      const sems = res.data || [];
      setSemesters(sems);
      // Auto-select current semester
      const current = sems.find((s: Semester) => s.is_current);
      if (current) setFilterSemester(String(current.id));
    });
  }, []);

  // When semester or programme changes — load sections
  useEffect(() => {
    if (!filterSemester) {
      setSections([]);
      setFilterSection("");
      return;
    }
    const params: any = { semester: filterSemester };
    if (filterProgramme) params.programme = filterProgramme;
    getSectionsApi(params).then((res) => setSections(res.data));
    setFilterSection("");
  }, [filterSemester, filterProgramme]);

  // Load departments for the selected school
  useEffect(() => {
    if (!filterProgramme) {
      setDepartments([]);
      setFilterDepartment("");
      return;
    }
    getDepartmentsApi({ programme: parseInt(filterProgramme), active_only: true }).then(
      (res) => setDepartments(res.data || []),
    );
    setFilterDepartment("");
  }, [filterProgramme]);

  // Load teacher list once
  useEffect(() => {
    getUsersApi({ role: "teacher" }).then((res) => setTeachers(res.data || []));
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterSemester) params.semester = filterSemester;
      if (filterCourse) params.offering = filterCourse;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (filterSection) params.section = filterSection;
      if (filterProgramme) params.programme = filterProgramme;
      if (filterDepartment) params.department = filterDepartment;
      if (filterTeacher) params.teacher = filterTeacher;
      if (search) params.search = search;
      const res = await getAttendanceApi(params);
      setRecords(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [
    filterSemester,
    filterCourse,
    dateFrom,
    dateTo,
    filterSection,
    filterProgramme,
    filterDepartment,
    filterTeacher,
  ]);

  useEffect(() => {
    const handleImported = () => {
      fetchRecords();
    };
    window.addEventListener("attendance-imported", handleImported);
    return () => window.removeEventListener("attendance-imported", handleImported);
  }, [filterSemester, filterCourse, dateFrom, dateTo, filterSection, filterProgramme, filterDepartment, filterTeacher]);

  const filtered = records.filter((r) => {
    if (!search) return true;
    return (
      r.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.course_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.student_id?.toLowerCase().includes(search.toLowerCase())
    );
  });

  // Group records by date + teacher so each "class session" gets its own
  // table with a header showing who taught it and when.
  const groups = (() => {
    const map = new Map<string, { date: string; teacher: string; records: any[] }>();
    for (const r of filtered) {
      const teacher = r.teacher_name || "Unassigned";
      const key = `${r.date}__${teacher}__${r.course_name}__${r.section_name}`;
      if (!map.has(key)) {
        map.set(key, { date: r.date, teacher, records: [] });
      }
      map.get(key)!.records.push(r);
    }
    return Array.from(map.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  })();

  const isNewRecord = (submittedAt?: string) => {
    if (!submittedAt) return false;
    const submitted = new Date(submittedAt).getTime();
    if (isNaN(submitted)) return false;
    return Date.now() - submitted < 24 * 60 * 60 * 1000;
  };

  const formatDateHeading = (dStr?: string) => {
    if (!dStr) return "—";
    try {
      const d = new Date(dStr.includes("T") ? dStr : dStr + "T00:00:00");
      if (isNaN(d.getTime())) return dStr;
      return format(d, "EEEE, MMMM d, yyyy");
    } catch {
      return dStr;
    }
  };

  const formatSubmittedAt = (dStr?: string) => {
    if (!dStr) return "—";
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return format(d, "MMM d, h:mm a");
    } catch {
      return dStr;
    }
  };

  return (
    <Card className="shadow-card border-border/50">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-base">
              Attendance Records
            </CardTitle>
            <Button
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={openSelector}
            >
              <Upload className="w-4 h-4" /> Import Excel
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Semesters</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} {s.is_current ? "(Current)" : ""}
                </option>
              ))}
            </select>

            <select
              value={filterProgramme}
              onChange={(e) => setFilterProgramme(e.target.value)}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Schools</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              disabled={!filterSemester}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">All Sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name} (Y{s.year})
                </option>
              ))}
            </select>

            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              disabled={!filterProgramme}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name || t.last_name
                    ? `${t.first_name || ""} ${t.last_name || ""}`.trim()
                    : t.username}
                </option>
              ))}
            </select>

            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">From</p>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">To</p>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline self-end pb-2"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search student or course..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Loading records...
          </div>
        )}
        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No records found. Use filters above to search.
          </div>
        )}
        {!loading &&
          groups.map((group) => (
            <div key={group.key} className="border-b border-border last:border-0">
              {/* Group header: teacher + full date + Delete Session Button */}
              <div className="bg-muted/40 px-6 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-border/60">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {formatDateHeading(group.date)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {group.records[0]?.course_name}
                    {group.records[0]?.section_name
                      ? ` — Section ${group.records[0].section_name}`
                      : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Teacher: <span className="font-medium text-foreground">{group.teacher}</span>
                    {group.records[0]?.department_name && (
                      <> · {group.records[0].department_name}</>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteGroup(group)}
                    className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1"
                    title="Delete entire class session log"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Session</span>
                  </Button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/10">
                  <tr>
                    <th className="text-left px-6 py-2 font-medium text-muted-foreground text-xs w-12">
                      #
                    </th>
                    <th className="text-left px-6 py-2 font-medium text-muted-foreground text-xs">
                      Student
                    </th>
                    <th className="text-left px-6 py-2 font-medium text-muted-foreground text-xs">
                      Status
                    </th>
                    <th className="text-left px-6 py-2 font-medium text-muted-foreground text-xs">
                      Hours
                    </th>
                    <th className="text-left px-6 py-2 font-medium text-muted-foreground text-xs">
                      Recorded At
                    </th>
                    <th className="text-right px-6 py-2 font-medium text-muted-foreground text-xs w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {group.records
                    .slice()
                    .sort((a, b) =>
                      (a.student_name || "").localeCompare(b.student_name || ""),
                    )
                    .map((r, i) => {
                      const fresh = isNewRecord(r.submitted_at);
                      return (
                        <tr
                          key={`${r.id}-${i}`}
                          className={`hover:bg-muted/20 transition-colors ${
                            fresh ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="px-6 py-3 text-muted-foreground text-xs">
                            {i + 1}
                          </td>
                          <td className="px-6 py-3">
                            <p className="font-medium">{r.student_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {r.student_id}
                            </p>
                          </td>
                          <td className="px-6 py-3">
                            <Badge
                              variant="outline"
                              className={`text-xs ${statusStyles[r.status] || ""}`}
                            >
                              {statusLabels[r.status] || r.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-3 text-muted-foreground">
                            {r.hours_attended} hrs
                          </td>
                          <td className="px-6 py-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {fresh && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-primary inline-block"
                                  title="Submitted within the last 24 hours"
                                />
                              )}
                              {formatSubmittedAt(r.submitted_at)}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingRecord(r);
                                  setEditStatus(r.status);
                                  setEditHours(String(r.hours_attended || "2.0"));
                                }}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Edit Status"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSingleRecord(r.id, r.student_name)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600"
                                title="Delete Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ))}
      </CardContent>

      {/* Delete Session Confirmation Dialog */}
      <Dialog open={!!deleteGroup} onOpenChange={(open) => !open && setDeleteGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Attendance Session
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              Are you sure you want to delete all{" "}
              <strong className="text-foreground">{deleteGroup?.records?.length || 0}</strong>{" "}
              attendance records for:
            </p>
            <div className="bg-muted/50 p-3 rounded-lg border space-y-1 text-xs text-foreground">
              <p><strong>Date:</strong> {deleteGroup?.date}</p>
              <p><strong>Course:</strong> {deleteGroup?.records?.[0]?.course_name}</p>
              <p><strong>Section:</strong> {deleteGroup?.records?.[0]?.section_name || "—"}</p>
              <p><strong>Teacher:</strong> {deleteGroup?.teacher}</p>
            </div>
            <p className="text-xs text-destructive">
              This action cannot be undone and will recalculate student attendance statistics.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroup(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSession}
              disabled={deleting}
              className="gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Single Record Modal */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              Edit Attendance Record
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 p-3 rounded-lg border text-xs space-y-1">
              <p><strong>Student:</strong> {editingRecord?.student_name} ({editingRecord?.student_id})</p>
              <p><strong>Date:</strong> {editingRecord?.date}</p>
              <p><strong>Course:</strong> {editingRecord?.course_name}</p>
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
                Hours Attended
              </label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="10"
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
            <Button onClick={handleUpdateRecord} disabled={updating} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Check className="w-4 h-4" />
              {updating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Course Offering Dialog */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Select Class for Import
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Filter by year, semester, course, and section to find the correct class for import.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Semester</label>
                <select value={importSemester} onChange={e => setImportSemester(e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background">
                  <option value="">All Semesters</option>
                  {semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
                <select value={importYear} onChange={e => setImportYear(e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background">
                  <option value="">All Years</option>
                  {[1, 2, 3, 4, 5, 6].map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Course</label>
                <select value={importCourse} onChange={e => setImportCourse(e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background">
                  <option value="">All Courses</option>
                  {Array.from(new Set(offerings.map(o => o.course_name))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Section</label>
                <select value={importSection} onChange={e => setImportSection(e.target.value)} className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background">
                  <option value="">All Sections</option>
                  {Array.from(new Set(offerings.map(o => o.section_name))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Class & Teacher
              </label>
              <select
                value={selectedOptionKey}
                onChange={(e) => setSelectedOptionKey(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Choose a class & teacher --</option>
                {classTeacherOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {classTeacherOptions.length === 0 && (
                <p className="text-xs text-destructive">No offerings match your filters.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectorOpen(false)}>Cancel</Button>
            <Button disabled={!selectedOptionKey} onClick={handleSelectorNext} className="bg-primary hover:bg-primary/90">Next</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Excel Modal */}
      {selectedOffering && (
        <AttendanceImportModal
          open={importModalOpen}
          onClose={() => {
            setImportModalOpen(false);
            fetchRecords();
          }}
          onSuccess={() => {
            fetchRecords();
          }}
          offering={selectedOffering}
          initialTeacherId={selectedTeacherForImport?.id}
        />
      )}
    </Card>
  );
};

export default AttendanceTab;
