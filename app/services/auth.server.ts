import { createCookieSessionStorage, redirect } from "@remix-run/node";
import bcrypt from "bcryptjs";
import prisma from "../db.server";

// Cấu hình Cookie SessionStorage cho Team Admin độc lập
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "team_admin_session",
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.JWT_SECRET || "bridge-custom-secret"],
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 ngày
  },
});

/**
 * Xác thực Email & Mật khẩu tài khoản Team
 */
export async function authenticateTeamUser(email: string, passwordAttempt: string) {
  const user = await prisma.user.findUnique({
    where: { email, isActive: true },
  });

  if (!user || !user.passwordHash) {
    return null;
  }

  // Mật khẩu mặc định seed: "Admin@123456"
  // Kiểm tra bcrypt hash hoặc so sánh plain text nếu khởi tạo thử nghiệm
  let isValid = false;
  try {
    isValid = await bcrypt.compare(passwordAttempt, user.passwordHash);
  } catch {
    isValid = user.passwordHash === passwordAttempt;
  }

  if (!isValid) return null;
  return user;
}

/**
 * Tạo Session Cookie và chuyển hướng người dùng
 */
export async function createUserSession(userId: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("userId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

/**
 * Lấy userId từ Session Cookie
 */
export async function getTeamUserId(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") return null;
  return userId;
}

/**
 * Bắt buộc Đăng nhập: Yêu cầu có Session Cookie, nếu không chuyển hướng về /login
 */
export async function requireTeamUserId(request: Request, redirectTo: string = new URL(request.url).pathname) {
  const userId = await getTeamUserId(request);
  if (!userId) {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }
  return userId;
}

/**
 * Đăng xuất tài khoản Team
 */
export async function logoutTeamUser(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
