import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import StatsCards from "@/components/admin/StatsCards";
import AttendanceChart from "@/components/admin/AttendanceChart";
import StatusDistribution from "@/components/admin/StatusDistribution";
import AtRiskTable from "@/components/admin/AtRiskTable";
import RecentActivity from "@/components/admin/RecentActivity";
import CoursesTab from "@/components/admin/CoursesTab";
import ReportsTab from "@/components/admin/ReportsTab";
import NotificationsTab from "@/components/admin/NotificationsTab";
import StudentsTab from "@/components/admin/StudentsTab";
import AttendanceTab from "@/components/admin/AttendanceTab";
import UserRolesTab from "@/components/admin/UserRolesTab";
import SettingsTab from "@/components/admin/SettingsTab";
import SetupTab from "@/components/admin/SetupTab";
import { Building2, Filter } from "lucide-react";
import {
  getCoursesApi,
  getStudentsApi,
  getNotificationsApi,
  markNotificationReadApi,
  getProgrammesApi,
  getDepartmentsApi,
  getStatsApi,
  getAtRiskApi,
  getSemestersApi,
} from "@/api/axios";

const tabTitles: Record<string, string> = {
  overview: "Dashboard Overview",
  students: "Student Management",
  courses: "Course Management",
  attendance: "Attendance Records",
  "at-risk": "At-Risk Students",
  "user-roles": "User Roles",
  reports: "Reports & Analytics",
  notifications: "Notifications",
  settings: "Settings",
  setup: "System Setup",
};

export interface Course {
  id: number;
  name: string;
  code: string;
  total_credit_hours: string;
  minimum_required_hours?: number;
  minimum_attendance_percent?: number;
  programme_name: string;
  year: number;
  semester?: number;
  department_name?: string;
  department?: number;
}
export interface Programme {
  id: number;
  name: string;
  duration_years: number;
}
export interface Notification {
  id: number;
  message: string;
  notification_type: string;
  created_at: string;
}

const AdminDashboard = () => {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [programmes, setProgrammes] = useState<any[]>([]);
  const [deanDepartments, setDeanDepartments] = useState<{ id: number; name: string }[]>([]);
  const [selectedDeanDept, setSelectedDeanDept] = useState<string>("");
  const [stats, setStats] = useState<{
    total_students: number;
    total_courses: number;
    total_programmes: number;
    active_enrollments: number;
    status_distribution?: {
      present: number;
      late: number;
      excused: number;
      absent: number;
    };
  }>({
    total_students: 0,
    total_courses: 0,
    total_programmes: 0,
    active_enrollments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [atRiskCount, setAtRiskCount] = useState(0);
  const [currentSemesterId, setCurrentSemesterId] = useState<
    number | undefined
  >();
  const [filteredStatusCounts, setFilteredStatusCounts] = useState<{
    present: number;
    late: number;
    excused: number;
    absent: number;
  } | null>(null);

  const u = user as any;
  const deanProgrammeId = role === "dean" ? u?.managed_programme : null;

  useEffect(() => {
    if (role === "dean" && deanProgrammeId) {
      getDepartmentsApi({ programme: deanProgrammeId, active_only: true })
        .then((res) => setDeanDepartments(res.data || []))
        .catch((e) => console.error(e));
    }
  }, [role, deanProgrammeId]);

  // Dynamic scope filter params for dean and dept_head
  const scopeParams: Record<string, any> = (() => {
    if (!user) return {};
    if (role === "dean" && u.managed_programme) {
      const params: Record<string, any> = { programme: u.managed_programme };
      if (selectedDeanDept) params.department = selectedDeanDept;
      return params;
    }
    if (role === "dept_head") {
      const progId = u.managed_department_programme || u.managed_programme;
      const params: Record<string, any> = {};
      if (u.managed_department) params.department = u.managed_department;
      if (progId) params.programme = progId;
      return params;
    }
    return {};
  })();

  const refreshProgrammes = async () => {
    try {
      const programmesRes = await getProgrammesApi({ active_only: true });
      setProgrammes(programmesRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    try {
      const semRes = await getSemestersApi({ current: true });
      const currentSemester = semRes.data?.[0];
      if (currentSemester) setCurrentSemesterId(currentSemester.id);
      const semId = currentSemester?.id;
      const baseParams = semId
        ? { semester: semId, ...scopeParams }
        : scopeParams;

      // Build programme and department scoped params for courses and students
      const courseParams: Record<string, any> = { active_only: true };
      const studentParams: Record<string, any> = {};
      if (scopeParams.programme) {
        courseParams.programme = scopeParams.programme;
        studentParams.programme = scopeParams.programme;
      }
      if (scopeParams.department) {
        courseParams.department = scopeParams.department;
        studentParams.department = scopeParams.department;
      }

      const results = await Promise.allSettled([
        getCoursesApi(courseParams),
        getStudentsApi(studentParams),
        getNotificationsApi(),
        getProgrammesApi({ active_only: true }),
        getStatsApi(baseParams),
        getAtRiskApi(baseParams),
      ]);

      const [
        coursesRes,
        studentsRes,
        notifRes,
        programmesRes,
        statsRes,
        atRiskRes,
      ] = results;

      if (coursesRes.status === 'fulfilled') setCourses(coursesRes.value.data);
      if (studentsRes.status === 'fulfilled') setStudents(studentsRes.value.data || []);
      if (notifRes.status === 'fulfilled') setNotifications(notifRes.value.data.notifications || []);
      if (programmesRes.status === 'fulfilled') setProgrammes(programmesRes.value.data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (atRiskRes.status === 'fulfilled') setAtRiskCount(atRiskRes.value.data.count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Poll for new notifications
    const interval = setInterval(async () => {
      try {
        const notifRes = await getNotificationsApi();
        setNotifications(notifRes.data.notifications || []);
      } catch (e) {
        console.error("Failed to fetch notifications:", e);
      }
    }, 15000); // 15 seconds
    
    return () => clearInterval(interval);
  }, [selectedDeanDept]);

  const handleMarkRead = async (id: number) => {
    await markNotificationReadApi(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const activeStatusCounts = filteredStatusCounts || {
    present: stats.status_distribution?.present || 0,
    late: stats.status_distribution?.late || 0,
    excused: stats.status_distribution?.excused || 0,
    absent: stats.status_distribution?.absent || 0,
  };

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:hidden transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <AdminSidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSidebarOpen(false);
          }}
          notificationCount={notifications.length}
          forceVisible
        />
      </div>

      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
        notificationCount={notifications.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader
          title={tabTitles[activeTab] || "Dashboard"}
          onMenuToggle={() => setSidebarOpen(true)}
          notifications={notifications}
          onMarkRead={handleMarkRead}
          onNavigate={setActiveTab}
          students={students}
          courses={courses}
        />

        <main className="flex-1 p-4 lg:p-6 space-y-6 overflow-auto">
          {activeTab === "overview" && (
            <>
              {role === "dean" && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border/60 rounded-xl p-3.5 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        Dean Control Level:
                        <span className="text-primary font-bold">
                          {selectedDeanDept
                            ? deanDepartments.find((d) => String(d.id) === selectedDeanDept)?.name || "Department View"
                            : "Whole School / Faculty Level"}
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Switch between whole school overview or filter down to a specific department
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Department Filter:
                    </span>
                    <select
                      value={selectedDeanDept}
                      onChange={(e) => setSelectedDeanDept(e.target.value)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-input bg-background font-medium focus:ring-2 focus:ring-ring outline-none"
                    >
                      <option value="">🏫 All Departments (Whole School Level)</option>
                      {deanDepartments.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          🏢 {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <StatsCards
                totalStudents={stats.total_students}
                totalCourses={stats.total_courses}
                atRiskCount={atRiskCount}
                totalRecords={stats.active_enrollments}
              />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <AttendanceChart onDataFetched={setFilteredStatusCounts} />
                </div>
                <StatusDistribution
                  present={activeStatusCounts.present}
                  late={activeStatusCounts.late}
                  exempted={activeStatusCounts.excused}
                  absent={activeStatusCounts.absent}
                />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <AtRiskTable semesterId={currentSemesterId} scopeParams={scopeParams} />
                </div>
                <RecentActivity notifications={notifications} />
              </div>
            </>
          )}
          {activeTab === "students" && <StudentsTab programmes={programmes} scopeParams={scopeParams} />}
          {activeTab === "courses" && (
            <CoursesTab
              courses={courses}
              programmes={programmes}
              onCoursesChange={setCourses}
            />
          )}
          {activeTab === "attendance" && (
            <AttendanceTab courses={courses} programmes={programmes} />
          )}
          {activeTab === "at-risk" && (
            <AtRiskTable semesterId={currentSemesterId} fullPage scopeParams={scopeParams} />
          )}
          {activeTab === "user-roles" && <UserRolesTab />}
          {activeTab === "reports" && <ReportsTab courses={courses} />}
          {activeTab === "notifications" && (
            <NotificationsTab
              notifications={notifications}
              onMarkRead={handleMarkRead}
            />
          )}
          {activeTab === "settings" && <SettingsTab />}
          {activeTab === "setup" && <SetupTab onProgrammesChange={refreshProgrammes} />}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;