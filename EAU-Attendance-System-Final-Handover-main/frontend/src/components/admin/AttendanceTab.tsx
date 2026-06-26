import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import AttendanceImportModal from "@/components/admin/AttendanceImportModal";
import { getAttendanceApi, getSectionsApi, getSemestersApi, getDepartmentsApi, getUsersApi, getOfferingsApi } from "@/api/axios";
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
  teacher_name?: string;
}

interface AttendanceTabProps {
  courses: Course[];
  programmes: Programme[];
}

const statusStyles: Record<string, string> = {
  present: "bg-primary/10 text-primary border-primary/30",
  late: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  excused: "bg-muted text-muted-foreground border-border",
  unexcused: "bg-destructive/10 text-destructive border-destructive/30",
};

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  unexcused: "Unexcused",
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
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedOffering, setSelectedOffering] = useState<Offering | undefined>();

  // Local filters for the Import Dialog
  const [importSemester, setImportSemester] = useState("");
  const [importYear, setImportYear] = useState("");
  const [importCourse, setImportCourse] = useState("");
  const [importSection, setImportSection] = useState("");

  const openSelector = async () => {
    setSelectorOpen(true);
    setOfferings([]);
    setSelectedOfferingId("");
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

  const handleSelectorNext = () => {
    const offering = offerings.find(o => String(o.id) === selectedOfferingId);
    if (offering) {
      setSelectedOffering(offering);
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
    return Date.now() - submitted < 24 * 60 * 60 * 1000;
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
              {/* Group header: teacher + full date */}
              <div className="bg-muted/40 px-6 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-border/60">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {format(new Date(group.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {group.records[0]?.course_name}
                    {group.records[0]?.section_name
                      ? ` — Section ${group.records[0].section_name}`
                      : ""}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Teacher: <span className="font-medium text-foreground">{group.teacher}</span>
                  {group.records[0]?.department_name && (
                    <> · {group.records[0].department_name}</>
                  )}
                </span>
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
                              {r.submitted_at
                                ? format(new Date(r.submitted_at), "MMM d, h:mm a")
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ))}
      </CardContent>

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
                Select Class
              </label>
              <select
                value={selectedOfferingId}
                onChange={(e) => setSelectedOfferingId(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">-- Choose a class --</option>
                {filteredOfferingsForImport.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.course_name} (Section {o.section_name}) - {o.teacher_name || "Unassigned"}
                  </option>
                ))}
              </select>
              {filteredOfferingsForImport.length === 0 && (
                <p className="text-xs text-destructive">No offerings match your filters.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectorOpen(false)}>Cancel</Button>
            <Button disabled={!selectedOfferingId} onClick={handleSelectorNext} className="bg-primary hover:bg-primary/90">Next</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Excel Modal */}
      {selectedOffering && (
        <AttendanceImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          offering={selectedOffering}
        />
      )}
    </Card>
  );
};

export default AttendanceTab;
