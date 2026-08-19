import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginWithEmail } from "@/lib/firebase";
import { Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      await loginWithEmail(email, password);
      setLocation("/dashboard");
    } catch (err: any) {
      const msg = String(err?.message || "").toLowerCase();
      if (err?.code === "auth/invalid-credential" || msg.includes("invalid")) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      } else if (msg.includes("email not confirmed")) {
        setError("البريد الإلكتروني لم يتم تأكيده");
      } else {
        setError("حدث خطأ، يرجى المحاولة مرة أخرى");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111b21] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="bg-[#202c33] rounded-lg p-8 shadow-xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#00a884] rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">تسجيل الدخول</h1>
            <p className="text-[#8696a0] mt-2">لوحة تحكم الدرعية</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[#8696a0]">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8696a0]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                  maxLength={120}
                  className="bg-[#2a3942] border-[#2a3942] text-white pr-10 focus:border-[#00a884]"
                  placeholder="admin@example.com"
                  required
                  data-testid="input-login-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#8696a0]">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8696a0]" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.slice(0, 128))}
                  maxLength={128}
                  className="bg-[#2a3942] border-[#2a3942] text-white pr-10 focus:border-[#00a884]"
                  placeholder="••••••••"
                  required
                  data-testid="input-login-password"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center" data-testid="error-login">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00a884] hover:bg-[#00a884]/90 text-white py-6"
              data-testid="button-login-submit"
            >
              {loading ? "جاري تسجيل الدخول..." : "دخول"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
