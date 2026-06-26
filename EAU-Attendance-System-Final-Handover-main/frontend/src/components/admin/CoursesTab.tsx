import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Download, Search, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createCourseApi, updateCourseApi, deleteCourseApi, bulkDeleteCoursesApi, getDepartmentsApi } from "@/api/axios";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";

interface Course {
  id: number;
  name: string;
  code: string;
  total_credit_hours: string;
  minimum_required_hours?: number;
  minimum_attendance_percent?: number;
  programme: number;
  programme_name: string;
  department?: number | null;
  department_name?: string;
  year: number;
  semester?: number;
  is_active?: boolean;
}

interface Programme {
  id: number;
  name: string;
  code?: string;
  duration_years: number;
}

interface Department {
  id: number;
  name: string;
  code?: string;
  programme: number;
  programme_name?: string;
}

interface CoursesTabProps {
  courses: Course[];
  programmes: Programme[];
  onCoursesChange: (courses: Course[]) => void;
}

const parseFileToRows = async (
  file: File,
): Promise<Record<string, string>[]> => {
  const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
  if (isExcel) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });
    const headers = (raw[0] as string[]).map((h) =>
      String(h).trim().toLowerCase(),
    );
    return raw
      .slice(1)
      .filter((r) => r.some((v: any) => String(v).trim() !== ""))
      .map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = String(r[i] ?? "").trim();
        });
        return obj;
      });
  } else {
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || "";
      });
      return obj;
    });
  }
};

const CoursesTab = ({
  courses: initialCourses,
  programmes,
  onCoursesChange,
}: CoursesTabProps) => {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [courses, setCourses] = useState(initialCourses);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    total_credit_hours: "",
    year: "1",
    semester: "1",
    programme_id: "",
    department_id: "",
  });
  const [editDepartments, setEditDepartments] = useState<Department[]>([]);
  const [addForm, setAddForm] = useState({
    name: "",
    code: "",
    total_credit_hours: "",
    programme_id: "",
    department_id: "",
    year: "1",
    semester: "1",
  });
  const [addDepartments, setAddDepartments] = useState<Department[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    created: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filter/search state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProgramme, setFilterProgramme] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Derived filtered list
  const filteredCourses = courses.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.code && c.code.toLowerCase().includes(q));
    const matchesProgramme =
      filterProgramme === "all" || c.programme_name === filterProgramme;
    const matchesDepartment =
      filterDepartment === "all" || c.department_name === filterDepartment;
    const matchesYear =
      filterYear === "all" || String(c.year) === filterYear;
    const matchesSemester =
      filterSemester === "all" || String(c.semester) === filterSemester;
    return (
      matchesSearch &&
      matchesProgramme &&
      matchesDepartment &&
      matchesYear &&
      matchesSemester
    );
  });

  // Load all departments (for the department filter and CSV import lookups)
  useEffect(() => {
    getDepartmentsApi({ active_only: true })
      .then((r) => setAllDepartments(r.data || []))
      .catch(() => setAllDepartments([]));
  }, []);

  // Load departments for the Add form when its programme changes
  useEffect(() => {
    if (!addForm.programme_id) {
      setAddDepartments([]);
      return;
    }
    getDepartmentsApi({
      programme: parseInt(addForm.programme_id),
      active_only: true,
    })
      .then((r) => setAddDepartments(r.data || []))
      .catch(() => setAddDepartments([]));
  }, [addForm.programme_id]);

  const updateLocal = (updated: Course[]) => {
    setCourses(updated);
    onCoursesChange(updated);
  };

  const openEdit = (course: Course) => {
    setEditCourse(course);
    const progId = course.programme
      ? String(course.programme)
      : (programmes.find((p) => p.name === course.programme_name)?.id
          ? String(programmes.find((p) => p.name === course.programme_name)!.id)
          : "");
    setEditForm({
      name: course.name,
      code: course.code || "",
      total_credit_hours: course.total_credit_hours,
      year: String(course.year),
      semester: String(course.semester || 1),
      programme_id: progId,
      department_id: course.department ? String(course.department) : "",
    });
    // Load departments for this programme
    if (progId) {
      getDepartmentsApi({ programme: parseInt(progId), active_only: true })
        .then((r) => setEditDepartments(r.data || []))
        .catch(() => setEditDepartments([]));
    } else {
      setEditDepartments([]);
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editCourse) return;
    setSaving(true);
    try {
      const payload: any = {
        name: editForm.name,
        code: editForm.code,
        total_credit_hours: parseFloat(editForm.total_credit_hours),
        year: parseInt(editForm.year),
        semester: parseInt(editForm.semester),
      };
      if (editForm.programme_id) payload.programme_id = parseInt(editForm.programme_id);
      payload.department_id = editForm.department_id ? parseInt(editForm.department_id) : null;
      const res = await updateCourseApi(editCourse.id, payload);
      updateLocal(
        courses.map((c) =>
          c.id === editCourse.id ? { ...c, ...res.data } : c,
        ),
      );
      toast.success("Course updated!");
      setEditOpen(false);
    } catch {
      toast.error("Failed to update course");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!addForm.name || !addForm.total_credit_hours || !addForm.programme_id) {
      toast.error("Name, credit hours and school are required");
      return;
    }
    setAdding(true);
    try {
      const res = await createCourseApi({
        name: addForm.name,
        code: addForm.code,
        total_credit_hours: parseFloat(addForm.total_credit_hours),
        programme_id: parseInt(addForm.programme_id),
        department_id: addForm.department_id ? parseInt(addForm.department_id) : undefined,
        year: parseInt(addForm.year),
        semester: parseInt(addForm.semester),
      });
      updateLocal([...courses, res.data]);
      toast.success("Course added!");
      setAddOpen(false);
      setAddForm({
        name: "",
        code: "",
        total_credit_hours: "",
        programme_id: "",
        department_id: "",
        year: "1",
        semester: "1",
      });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to add course");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Deactivate this course? It will no longer appear in new offerings.",
      )
    )
      return;
    try {
      await deleteCourseApi(id);
      updateLocal(courses.filter((c) => c.id !== id));
      toast.success("Course deactivated.");
    } catch {
      toast.error("Failed to deactivate course");
    }
  };

  const handleBulkDelete = async (hard: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await bulkDeleteCoursesApi(selectedIds, hard);
      toast.success(res.data.message);
      setBulkDeleteOpen(false);
      updateLocal(courses.filter((c) => !selectedIds.includes(c.id)));
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      "Course Name,Code,School,Department,Year,Semester,Credit Hours",
      "Aerodynamics I,AERO201,AME,AME-DEPT,2,1,48",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "courses_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResults(null);

    let rows: Record<string, string>[];
    try {
      rows = await parseFileToRows(file);
    } catch {
      toast.error(
        "Failed to read file. Make sure it is a valid CSV or Excel file.",
      );
      setImporting(false);
      return;
    }

    let created = 0;
    const errors: { row: number; error: string }[] = [];
    const newCourses: Course[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const courseName = row["course name"];
      const code = row["code"];
      const school = row["school"];
      const dept = row["department"];
      const year = row["year"];
      const sem = row["semester"];
      const creditHours = row["credit hours"];

      if (!courseName || !code || !school || !dept || !year || !sem || !creditHours) {
        errors.push({
          row: i + 2,
          error: "All fields are mandatory (Course Name, Code, School, Department, Year, Semester, Credit Hours)",
        });
        continue;
      }
      const prog = programmes.find(
        (p) =>
          p.code?.toLowerCase() === school?.toLowerCase() ||
          p.name?.toLowerCase() === school?.toLowerCase(),
      );
      if (!prog) {
        errors.push({
          row: i + 2,
          error: `School "${school}" not found`,
        });
        continue;
      }
      let deptObj: Department | undefined;
      deptObj = allDepartments.find(
        (d) =>
          d.programme === prog.id &&
          (d.code?.toLowerCase() === dept?.toLowerCase() ||
            d.name?.toLowerCase() === dept?.toLowerCase()),
      );
      if (!deptObj) {
        errors.push({
          row: i + 2,
          error: `Department "${dept}" not found in ${prog.name}`,
        });
        continue;
      }
      try {
        const res = await createCourseApi({
          name: courseName,
          code: code,
          total_credit_hours: parseFloat(creditHours),
          programme_id: prog.id,
          department_id: deptObj?.id,
          year: parseInt(year) || 1,
          semester: parseInt(sem) || 1,
        });
        newCourses.push(res.data);
        created++;
      } catch (err: any) {
        errors.push({
          row: i + 2,
          error: err?.response?.data?.error || "Failed",
        });
      }
    }

    // Add all new courses at once — fixes stale state bug
    if (newCourses.length > 0) {
      const updated = [...courses, ...newCourses];
      setCourses(updated);
      onCoursesChange(updated);
    }

    setImportResults({ created, errors });
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
    if (created > 0) toast.success(`${created} courses imported!`);
  };

  const selectedProg = programmes.find(
    (p) => p.id === parseInt(addForm.programme_id),
  );
  const addYears = selectedProg
    ? Array.from({ length: selectedProg.duration_years }, (_, i) => i + 1)
    : [1, 2, 3, 4, 5];

  return (
    <>
      <Card className="shadow-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="font-display text-base">
            Course Management
          </CardTitle>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setImportResults(null);
                    setImportOpen(true);
                  }}
                >
                  <Upload className="w-4 h-4" /> Import CSV
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-primary hover:bg-primary/90"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="w-4 h-4" /> Add Course
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        {/* Search + Filter bar */}
        <div className="px-4 pb-3 pt-2 border-b border-border flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or code…"
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
            value={filterProgramme}
            onChange={(e) => setFilterProgramme(e.target.value)}
            className="py-1.5 px-3 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All schools</option>
            {[...new Set(courses.map((c) => c.programme_name))].sort().map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="py-1.5 px-3 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All departments</option>
            {[...new Set(courses.map((c) => c.department_name).filter(Boolean))]
              .sort()
              .map((d) => (
                <option key={d} value={d as string}>{d}</option>
              ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="py-1.5 px-3 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All years</option>
            {[...new Set(courses.map((c) => c.year))].sort().map((y) => (
              <option key={y} value={String(y)}>Year {y}</option>
            ))}
          </select>
          <select
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
            className="py-1.5 px-3 text-sm border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All semesters</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
          {(searchQuery ||
            filterProgramme !== "all" ||
            filterDepartment !== "all" ||
            filterYear !== "all" ||
            filterSemester !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterProgramme("all");
                setFilterDepartment("all");
                setFilterYear("all");
                setFilterSemester("all");
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredCourses.length} of {courses.length} courses
          </span>
        </div>
        {isAdmin && (
          <div className="flex items-center justify-between flex-wrap gap-2 px-1 pb-2">
            <button
              onClick={downloadTemplate}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Download CSV import template
            </button>
            {selectedIds.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete {selectedIds.length} selected
              </Button>
            )}
          </div>
        )}
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/30">
              <tr>
                {isAdmin && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredCourses.length > 0 &&
                        selectedIds.length === filteredCourses.length
                      }
                      onChange={() =>
                        setSelectedIds(
                          selectedIds.length === filteredCourses.length
                            ? []
                            : filteredCourses.map((c) => c.id),
                        )
                      }
                      className="rounded border-input"
                    />
                  </th>
                )}
                <th className="text-left px-3 py-3 font-medium text-muted-foreground w-12">
                  #
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Course Name
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Code
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  School
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Department
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Year / Sem
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Credit Hours
                </th>
                {isAdmin && (
                  <th className="text-right px-6 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCourses.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    No courses found
                  </td>
                </tr>
              )}
              {filteredCourses.map((c, idx) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  {isAdmin && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((x) => x !== c.id)
                              : [...prev, c.id],
                          )
                        }
                        className="rounded border-input"
                      />
                    </td>
                  )}
                  <td className="px-3 py-4 text-muted-foreground text-xs">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-4 font-medium text-primary">
                    {c.name}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                    {c.code || "—"}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {c.programme_name}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {c.department_name || "—"}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    Y{c.year} S{c.semester || 1}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {c.total_credit_hours}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Course Name
              </p>
              <input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Course Code
                </p>
                <input
                  value={editForm.code}
                  onChange={(e) =>
                    setEditForm({ ...editForm, code: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Credit Hours
                </p>
                <input
                  type="number"
                  value={editForm.total_credit_hours}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      total_credit_hours: e.target.value,
                    })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Year
                </p>
                <select
                  value={editForm.year}
                  onChange={(e) =>
                    setEditForm({ ...editForm, year: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Semester
                </p>
                <select
                  value={editForm.semester}
                  onChange={(e) =>
                    setEditForm({ ...editForm, semester: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                School
              </p>
              <select
                value={editForm.programme_id}
                onChange={(e) => {
                  const pid = e.target.value;
                  setEditForm({ ...editForm, programme_id: pid, department_id: "" });
                  if (pid) {
                    getDepartmentsApi({ programme: parseInt(pid), active_only: true })
                      .then((r) => setEditDepartments(r.data || []))
                      .catch(() => setEditDepartments([]));
                  } else {
                    setEditDepartments([]);
                  }
                }}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select school —</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Department <span className="normal-case font-normal">(optional)</span>
              </p>
              <select
                value={editForm.department_id}
                onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None / Unassigned —</option>
                {editDepartments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {editDepartments.length === 0 && editForm.programme_id && (
                <p className="text-xs text-muted-foreground mt-1">
                  No departments for this programme yet.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary hover:bg-primary/90"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Course Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add New Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Course Name *
              </p>
              <input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
                placeholder="e.g. Aerodynamics I"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Course Code
                </p>
                <input
                  value={addForm.code}
                  onChange={(e) =>
                    setAddForm({ ...addForm, code: e.target.value })
                  }
                  placeholder="e.g. AERO201"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Credit Hours *
                </p>
                <input
                  type="number"
                  value={addForm.total_credit_hours}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      total_credit_hours: e.target.value,
                    })
                  }
                  placeholder="e.g. 48"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                School *
              </p>
              <select
                value={addForm.programme_id}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    programme_id: e.target.value,
                    department_id: "",
                  })
                }
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select school</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Department
              </p>
              <select
                value={addForm.department_id}
                onChange={(e) =>
                  setAddForm({ ...addForm, department_id: e.target.value })
                }
                disabled={!addDepartments.length}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {addDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Year *
                </p>
                <select
                  value={addForm.year}
                  onChange={(e) =>
                    setAddForm({ ...addForm, year: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  {addYears.map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Semester *
                </p>
                <select
                  value={addForm.semester}
                  onChange={(e) =>
                    setAddForm({ ...addForm, semester: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={adding}
                className="bg-primary hover:bg-primary/90"
              >
                {adding ? "Adding..." : "Add Course"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              Import Courses via CSV or Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Required columns:</p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Download className="w-3 h-3" /> Download template
                </button>
              </div>
              <p className="font-mono text-xs">
                Course Name, Code, School, Department, Year, Semester, Credit Hours
              </p>
              <p className="text-xs text-muted-foreground">
                The <span className="font-medium">School</span> (programme code) and <span className="font-medium">Department</span>{" "}
                must match codes already set up in the system. All fields are mandatory.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Upload CSV or Excel File
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImport}
                disabled={importing}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none"
              />
              {importing && (
                <p className="text-xs text-muted-foreground">
                  Importing courses...
                </p>
              )}
            </div>

            {importResults && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  importResults.errors.length === 0
                    ? "bg-primary/10"
                    : "bg-muted"
                }`}
              >
                <p className="font-medium">
                  {importResults.created} courses imported successfully
                </p>
                {importResults.errors.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {importResults.errors.map((e, i) => (
                      <p key={i} className="text-xs text-destructive">
                        Row {e.row}: {e.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Modal */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete {selectedIds.length} Course
              {selectedIds.length === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose how to remove the selected course
              {selectedIds.length === 1 ? "" : "s"}. Permanent deletion cannot
              be undone.
            </p>
            <div className="space-y-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Deactivate (recommended)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Hides the course from active lists but keeps existing
                  offerings and attendance history.
                </p>
              </div>
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Permanently delete everything
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Erases the course and all related offerings and attendance
                  records forever. Cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteOpen(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleBulkDelete(false)}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Working..." : "Deactivate"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleBulkDelete(true)}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Working..." : "Delete Permanently"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CoursesTab;