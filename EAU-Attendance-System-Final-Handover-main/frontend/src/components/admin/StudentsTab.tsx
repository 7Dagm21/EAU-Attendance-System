import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Pencil, Trash2, Plus, Upload, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getStudentsApi,
  createStudentApi,
  updateStudentApi,
  deleteStudentApi,
  bulkDeleteStudentsApi,
  getSectionsApi,
  getSemestersApi,
  getDepartmentsApi,
  bulkImportStudentsApi,
  createUserApi,
} from "@/api/axios";
import { useAuth } from "@/hooks/useAuth";

interface Programme {
  id: number;
  name: string;
  duration_years: number;
}
interface Department {
  id: number;
  name: string;
  code?: string;
  programme: number;
}
interface Semester {
  id: number;
  label: string;
  number: number;
  is_current: boolean;
}
interface Section {
  id: number;
  name: string;
  year: number;
  semester_label: string;
}
interface Student {
  id: number;
  first_name: string;
  last_name: string;
  student_id: string;
  email: string;
  parent_email: string;
  parent_telegram: string;
  programme: number | null;
  programme_name: string;
  department: number | null;
  department_name?: string;
  is_active: boolean;
  current_section: {
    section_id: number;
    section_name: string;
    year: number;
    programme: string;
    semester: string;
  } | null;
}

interface StudentsTabProps {
  programmes: Programme[];
  scopeParams?: Record<string, any>;
}

// Auto-generate a default password (student ID + "@EAU")
const makePassword = (studentId: string) => `${studentId}@EAU`;

// Download a single student's credentials as a CSV
const downloadCredentialsCsv = (
  firstName: string,
  lastName: string,
  email: string,
  studentId: string,
) => {
  const csv = [
    "name,email,student_id,password",
    `${firstName} ${lastName},${email},${studentId},${makePassword(studentId)}`,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credentials_${studentId.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const StudentsTab = ({ programmes, scopeParams = {} }: StudentsTabProps) => {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  // Filters
  const [filterProgramme, setFilterProgramme] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterDepartments, setFilterDepartments] = useState<Department[]>([]);

  // Selection / mass delete
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    student_id: "",
    email: "",
    parent_email: "",
    parent_telegram: "",
    programme_id: "",
    department_id: "",
    semester_id: "",
    year: "",
    section_id: "",
  });
  const [editSections, setEditSections] = useState<Section[]>([]);
  const [editDepartments, setEditDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: "",
    last_name: "",
    student_id: "",
    email: "",
    parent_email: "",
    parent_telegram: "",
    programme_id: scopeParams.programme ? String(scopeParams.programme) : "",
    department_id: "",
    section_id: "",
  });
  const [addDepartments, setAddDepartments] = useState<Department[]>([]);
  const [addSemester, setAddSemester] = useState("");
  const [addSections, setAddSections] = useState<Section[]>([]);
  const [addYear, setAddYear] = useState("");
  const [adding, setAdding] = useState(false);
  // FIX 3: toggle to also create a login account
  const [createLoginAccount, setCreateLoginAccount] = useState(true);

  // Bulk import
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Load semesters on mount
  useEffect(() => {
    getSemestersApi().then((res) => setSemesters(res.data || []));
    fetchStudents();
  }, []);

  // FIX 1: don't pass active_only by default — caused the empty list bug
  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {};
      // Apply scope restriction for dean/dept_head
      if (scopeParams.programme) params.programme = scopeParams.programme;
      // Allow local filter to override/narrow scope
      if (filterProgramme) params.programme = filterProgramme;
      if (filterDepartment) params.department = filterDepartment;
      if (filterSemester) params.semester = filterSemester;
      if (filterSection) params.section = filterSection;
      if (filterYear) params.year = filterYear;
      if (search) params.search = search;
      const res = await getStudentsApi(params);
      const sorted = (res.data || []).slice().sort((a: Student, b: Student) =>
        `${a.first_name} ${a.last_name}`.localeCompare(
          `${b.first_name} ${b.last_name}`,
        ),
      );
      setStudents(sorted);
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [filterProgramme, filterDepartment, filterSemester, filterSection, filterYear]);

  // Load departments for the department filter (scoped to selected programme, or all)
  useEffect(() => {
    const params: Record<string, any> = { active_only: true };
    if (filterProgramme) params.programme = filterProgramme;
    else if (scopeParams.programme) params.programme = scopeParams.programme;
    getDepartmentsApi(params).then((res) => setFilterDepartments(res.data || []));
  }, [filterProgramme]);

  // When semester + programme changes, load sections
  useEffect(() => {
    if (!filterSemester) {
      setSections([]);
      setFilterSection("");
      return;
    }
    const params: Record<string, string> = { semester: filterSemester };
    if (filterProgramme) params.programme = filterProgramme;
    getSectionsApi(params).then((res) => setSections(res.data || []));
    setFilterSection("");
  }, [filterSemester, filterProgramme]);

  // Add modal — load sections when semester + year selected
  useEffect(() => {
    if (!addSemester || !addYear || !addForm.programme_id) {
      setAddSections([]);
      return;
    }
    getSectionsApi({
      semester: parseInt(addSemester),
      programme: parseInt(addForm.programme_id),
      year: parseInt(addYear),
    }).then((res) => setAddSections(res.data || []));
  }, [addSemester, addYear, addForm.programme_id]);

  // Add modal — load departments when programme selected
  useEffect(() => {
    if (!addForm.programme_id) {
      setAddDepartments([]);
      return;
    }
    getDepartmentsApi({
      programme: parseInt(addForm.programme_id),
      active_only: true,
    }).then((res) => setAddDepartments(res.data || []));
  }, [addForm.programme_id]);

  const openEdit = (student: Student) => {
    setEditStudent(student);
    const progId = student.programme ? String(student.programme) : "";
    setEditForm({
      first_name: student.first_name,
      last_name: student.last_name,
      student_id: student.student_id,
      email: student.email,
      parent_email: student.parent_email || "",
      parent_telegram: student.parent_telegram || "",
      programme_id: progId,
      department_id: student.department ? String(student.department) : "",
      semester_id: "",
      year: student.current_section ? String(student.current_section.year) : "",
      section_id: student.current_section
        ? String(student.current_section.section_id)
        : "",
    });
    if (progId) {
      getDepartmentsApi({ programme: parseInt(progId), active_only: true }).then(
        (res) => setEditDepartments(res.data || []),
      );
    } else {
      setEditDepartments([]);
    }
    setEditSections([]);
    setEditOpen(true);
  };

  // Edit modal — load sections when programme + year selected
  useEffect(() => {
    if (!editForm.programme_id || !editForm.year) {
      setEditSections([]);
      return;
    }
    const params: Record<string, any> = {
      programme: parseInt(editForm.programme_id),
      year: parseInt(editForm.year),
    };
    if (editForm.semester_id) params.semester = parseInt(editForm.semester_id);
    getSectionsApi(params).then((res) => setEditSections(res.data || []));
  }, [editForm.programme_id, editForm.year, editForm.semester_id]);

  const handleSave = async () => {
    if (!editStudent) return;
    setSaving(true);
    try {
      const payload: any = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        student_id: editForm.student_id,
        email: editForm.email,
        parent_email: editForm.parent_email,
        parent_telegram: editForm.parent_telegram,
        programme_id: editForm.programme_id ? parseInt(editForm.programme_id) : null,
        department_id: editForm.department_id ? parseInt(editForm.department_id) : null,
      };
      if (editForm.section_id) payload.section_id = parseInt(editForm.section_id);
      const res = await updateStudentApi(editStudent.id, payload);
      setStudents((prev) =>
        prev
          .map((s) => (s.id === editStudent.id ? { ...s, ...res.data } : s))
          .slice()
          .sort((a, b) =>
            `${a.first_name} ${a.last_name}`.localeCompare(
              `${b.first_name} ${b.last_name}`,
            ),
          ),
      );
      toast.success("Student updated!");
      setEditOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to update student");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Deactivate this student? Their records will be kept."))
      return;
    try {
      await deleteStudentApi(id);
      setStudents((prev) => prev.filter((s) => s.id !== id));
      toast.success("Student deactivated.");
    } catch {
      toast.error("Failed to deactivate student");
    }
  };

  const handleAdd = async () => {
    if (
      !addForm.first_name ||
      !addForm.last_name ||
      !addForm.student_id ||
      !addForm.email
    ) {
      toast.error("Please fill all required fields");
      return;
    }
    setAdding(true);
    try {
      // FIX 2: pass args inline — no intermediate payload variable
      const res = await createStudentApi({
        first_name: addForm.first_name,
        last_name: addForm.last_name,
        student_id: addForm.student_id,
        email: addForm.email,
        parent_email: addForm.parent_email || undefined,
        parent_telegram: addForm.parent_telegram || undefined,
        programme_id: addForm.programme_id
          ? parseInt(addForm.programme_id)
          : undefined,
        department_id: addForm.department_id
          ? parseInt(addForm.department_id)
          : undefined,
        section_id: addForm.section_id
          ? parseInt(addForm.section_id)
          : undefined,
      });
      setStudents((prev) => [...prev, res.data]);

      // FIX 3: optionally create a login account so student appears in UserRoles
      if (createLoginAccount) {
        try {
          await createUserApi({
            username: addForm.email,
            first_name: addForm.first_name,
            last_name: addForm.last_name,
            email: addForm.email,
            staff_id: addForm.student_id,
            role: "student",
            password: makePassword(addForm.student_id),
          });
          // Auto-download credentials CSV
          downloadCredentialsCsv(
            addForm.first_name,
            addForm.last_name,
            addForm.email,
            addForm.student_id,
          );
          toast.success(
            `Student added! Credentials CSV downloaded. Password: ${makePassword(addForm.student_id)}`,
            { duration: 8000 },
          );
        } catch {
          toast.success("Student added!");
          toast.warning(
            "Could not create login account — an account with this email may already exist.",
          );
        }
      } else {
        toast.success("Student added!");
      }

      setAddOpen(false);
      setAddForm({
        first_name: "",
        last_name: "",
        student_id: "",
        email: "",
        parent_email: "",
        parent_telegram: "",
        programme_id: scopeParams.programme ? String(scopeParams.programme) : "",
        department_id: "",
        section_id: "",
      });
      setAddSemester("");
      setAddYear("");
      setCreateLoginAccount(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to add student");
    } finally {
      setAdding(false);
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await bulkImportStudentsApi(file);
      toast.success(res.data.message);
      fetchStudents();
      setImportOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleBulkDelete = async (hard: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await bulkDeleteStudentsApi(selectedIds, hard);
      toast.success(res.data.message);
      setBulkDeleteOpen(false);
      fetchStudents();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((s) => s.id));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const downloadStudentTemplate = () => {
    const csv = [
      "first_name,last_name,student_id,email,parent_email,parent_telegram,programme_code,department_code,section_id",
      "Abebe,Kebede,UGR/10001/24,abebe.kebede@example.com,parent1@example.com,,AME,AME-DEPT,",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = students.filter((s) => {
    if (!search) return true;
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    return (
      name.includes(search.toLowerCase()) ||
      s.student_id.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
    );
  });

  const yearOptionsFor = (programmeId: string) =>
    programmeId
      ? Array.from(
          {
            length:
              programmes.find((p) => p.id === parseInt(programmeId))
                ?.duration_years || 4,
          },
          (_, i) => i + 1,
        )
      : [];

  const addYears = yearOptionsFor(addForm.programme_id);
  const editYears = yearOptionsFor(editForm.programme_id);


  return (
    <>
      <Card className="shadow-card border-border/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base">
                Student Management
              </CardTitle>
              <div className="flex gap-2">
                {isAdmin && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload className="w-4 h-4" /> Import CSV
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-primary hover:bg-primary/90"
                      onClick={() => setAddOpen(true)}
                    >
                      <Plus className="w-4 h-4" /> Add Student
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
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
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Departments</option>
                {filterDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

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
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All Years</option>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>

              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchStudents()}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={downloadStudentTemplate}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download CSV import
                  template
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/30">
              <tr>
                {isAdmin && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 &&
                        selectedIds.length === filtered.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-input"
                    />
                  </th>
                )}
                <th className="text-left px-3 py-3 font-medium text-muted-foreground w-12">
                  #
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Name
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  University ID
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  School / Section
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Department
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Email
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Parent Telegram
                </th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">
                  Parent Email
                </th>
                {isAdmin && (
                  <th className="text-right px-6 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    Loading students...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 7}
                    className="text-center py-12 text-muted-foreground"
                  >
                    No students found
                  </td>
                </tr>
              )}
              {filtered.map((s, idx) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  {isAdmin && (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleSelectOne(s.id)}
                        className="rounded border-input"
                      />
                    </td>
                  )}
                  <td className="px-3 py-4 text-muted-foreground text-xs">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {s.first_name} {s.last_name}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-primary">
                    {s.student_id}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    <p>
                      {s.current_section?.programme || s.programme_name || "—"}
                    </p>
                    {s.current_section && (
                      <p className="text-muted-foreground/60">
                        Sec {s.current_section.section_name} · Y{s.current_section.year}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {s.department_name || "—"}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{s.email}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {s.parent_telegram ? (
                      <span className="text-blue-500">
                        @{s.parent_telegram.replace("@", "")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {s.parent_email || "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  First Name *
                </p>
                <input
                  value={editForm.first_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, first_name: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Last Name *
                </p>
                <input
                  value={editForm.last_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, last_name: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Registration No *
                </p>
                <input
                  value={editForm.student_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, student_id: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Email *
                </p>
                <input
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* School → Department → Semester → Year → Section */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  School
                </p>
                <select
                  value={editForm.programme_id}
                  onChange={(e) => {
                    setEditForm({
                      ...editForm,
                      programme_id: e.target.value,
                      department_id: "",
                      year: "",
                      section_id: "",
                    });
                    if (e.target.value) {
                      getDepartmentsApi({
                        programme: parseInt(e.target.value),
                        active_only: true,
                      }).then((res) => setEditDepartments(res.data || []));
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
                  Department
                </p>
                <select
                  value={editForm.department_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, department_id: e.target.value })
                  }
                  disabled={!editDepartments.length}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— Select —</option>
                  {editDepartments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Semester
                </p>
                <select
                  value={editForm.semester_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, semester_id: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select —</option>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}{s.is_current ? " (Current)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Year
                </p>
                <select
                  value={editForm.year}
                  onChange={(e) =>
                    setEditForm({ ...editForm, year: e.target.value, section_id: "" })
                  }
                  disabled={!editForm.programme_id}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— Select —</option>
                  {editYears.map((y) => (
                    <option key={y} value={y}>Year {y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Section
                </p>
                <select
                  value={editForm.section_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, section_id: e.target.value })
                  }
                  disabled={!editSections.length}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— Select —</option>
                  {editSections.map((s) => (
                    <option key={s.id} value={s.id}>Section {s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Parent Email
                </p>
                <input
                  value={editForm.parent_email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, parent_email: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Parent Telegram
                </p>
                <input
                  value={editForm.parent_telegram}
                  onChange={(e) =>
                    setEditForm({ ...editForm, parent_telegram: e.target.value })
                  }
                  placeholder="@username"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
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

      {/* Add Student Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Add New Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  First Name *
                </p>
                <input
                  value={addForm.first_name}
                  onChange={(e) =>
                    setAddForm({ ...addForm, first_name: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Last Name *
                </p>
                <input
                  value={addForm.last_name}
                  onChange={(e) =>
                    setAddForm({ ...addForm, last_name: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Registration No *
                </p>
                <input
                  value={addForm.student_id}
                  onChange={(e) =>
                    setAddForm({ ...addForm, student_id: e.target.value })
                  }
                  placeholder="UGR/10001/24"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Email *
                </p>
                <input
                  value={addForm.email}
                  onChange={(e) =>
                    setAddForm({ ...addForm, email: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Programme → Department → Semester → Year → Section */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  School
                </p>
                <select
                  value={addForm.programme_id}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      programme_id: e.target.value,
                      department_id: "",
                      section_id: "",
                    })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select</option>
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
                  <option value="">Select</option>
                  {addDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Semester
                </p>
                <select
                  value={addSemester}
                  onChange={(e) => setAddSemester(e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select</option>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {s.is_current ? " (Current)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Year
                </p>
                <select
                  value={addYear}
                  onChange={(e) => setAddYear(e.target.value)}
                  disabled={!addForm.programme_id}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">Select</option>
                  {addYears.map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Section
                </p>
                <select
                  value={addForm.section_id}
                  onChange={(e) =>
                    setAddForm({ ...addForm, section_id: e.target.value })
                  }
                  disabled={!addSections.length}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">Select</option>
                  {addSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      Section {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Parent Email
                </p>
                <input
                  value={addForm.parent_email}
                  onChange={(e) =>
                    setAddForm({ ...addForm, parent_email: e.target.value })
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Parent Telegram
                </p>
                <input
                  value={addForm.parent_telegram}
                  onChange={(e) =>
                    setAddForm({ ...addForm, parent_telegram: e.target.value })
                  }
                  placeholder="@username"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* FIX 3: Login account toggle */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createLoginAccount}
                  onChange={(e) => setCreateLoginAccount(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Create login account</p>
                  <p className="text-xs text-muted-foreground">
                    Adds this student to User Roles with role{" "}
                    <strong>student</strong>
                  </p>
                </div>
              </label>
              {createLoginAccount && addForm.student_id && addForm.email && (
                <div className="mt-2 ml-7 text-xs text-muted-foreground bg-muted rounded px-2 py-1.5 space-y-0.5">
                  <p>
                    Login with:{" "}
                    <span className="font-mono font-medium">
                      {addForm.student_id}
                    </span>{" "}
                    or{" "}
                    <span className="font-mono font-medium">
                      {addForm.email}
                    </span>
                  </p>
                  <p>
                    Password:{" "}
                    <span className="font-mono font-medium">
                      {makePassword(addForm.student_id)}
                    </span>
                  </p>
                </div>
              )}
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
                {adding ? "Adding..." : "Add Student"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              Bulk Import Students
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-muted/30 rounded-lg text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                CSV Format Required:
              </p>
              <p className="font-mono text-xs">
                first_name, last_name, student_id, email, parent_email,
                parent_telegram, programme_code, department_code, section_id
              </p>
              <p>
                The <span className="font-medium">programme_code</span> (school
                code) and <span className="font-medium">department_code</span>{" "}
                must match codes already set up in the system. The{" "}
                <span className="font-medium">section_id</span> is optional —
                students can be enrolled later.
              </p>
              <button
                onClick={downloadStudentTemplate}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Download CSV template
              </button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Upload CSV File
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleBulkImport}
                disabled={importing}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background outline-none"
              />
              {importing && (
                <p className="text-xs text-muted-foreground">Importing...</p>
              )}
            </div>
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
              Delete {selectedIds.length} Student
              {selectedIds.length === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose how to remove the selected student
              {selectedIds.length === 1 ? "" : "s"}. This action cannot be
              undone for a permanent delete.
            </p>
            <div className="space-y-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Deactivate (recommended)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Hides the student from active lists but keeps all
                  attendance history and records.
                </p>
              </div>
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Permanently delete everything
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Erases the student and all of their attendance records
                  forever. Cannot be undone.
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

export default StudentsTab;