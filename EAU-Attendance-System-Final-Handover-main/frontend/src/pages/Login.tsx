import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, UserCheck, KeyRound } from "lucide-react";
import eauLogo from "@/assets/eau-logo.png";

const Login = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error("Please enter your password");
      return;
    }
    setLoading(true);
    try {
      const loggedUser = await login("", password, selectedRole);
      const userRole = loggedUser?.role || localStorage.getItem("user_role");
      toast.success(`Welcome ${loggedUser?.first_name || ""}! Logged in successfully`);

      if (userRole === "admin" || userRole === "dean" || userRole === "dept_head") {
        window.location.href = "/admin";
      } else if (userRole === "teacher") {
        window.location.href = "/teacher";
      } else if (userRole === "student") {
        window.location.href = "/student";
      } else if (userRole === "parent") {
        window.location.href = "/parent";
      } else {
        window.location.href = "/teacher";
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
          "Invalid credentials. Please check your password.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md shadow-elevated animate-fade-in">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src={eauLogo}
              alt="Ethiopian Aviation University"
              className="h-24 object-contain"
            />
          </div>
          <CardTitle className="font-display text-xl">
            EAU Attendance System
          </CardTitle>
          <CardDescription>Sign in to access your portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4 mt-2">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label
                htmlFor="role-select"
                className="font-medium text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5 text-primary" /> Select Role / Portal
              </Label>
              <select
                id="role-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="admin">🔑 System Administrator</option>
                <option value="dean">🏛️ Dean (School Head)</option>
                <option value="dept_head">🏢 Department Head</option>
                <option value="teacher">👨‍🏫 Teacher / Instructor</option>
                <option value="student">🎓 Student</option>
              </select>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="font-medium text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-primary" /> Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full font-medium" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="text-center text-muted-foreground text-xs mt-6">
            Contact your administrator if you need assistance
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
