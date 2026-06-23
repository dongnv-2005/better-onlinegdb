import { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie'; // Đã fix: Import đầy đủ bộ đôi xử lý Cookie
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../../database/connection';
import { JWT_SECRET } from '../config';

export class AuthController {
  
  // --- UC-16: ĐĂNG KÝ TÀI KHOẢN ---
  static async signup(c: Context) {
    const { username, email, password } = await c.req.json();

    const usernameRegex = /^[a-zA-Z0-9]{5,20}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!usernameRegex.test(username)) {
      return c.json({ success: false, message: 'Username phải từ 5-20 ký tự và không chứa ký tự đặc biệt.' }, 400);
    }
    if (!emailRegex.test(email)) {
      return c.json({ success: false, message: 'Email không đúng định dạng.' }, 400);
    }
    if (!password || password.length < 8) {
      return c.json({ success: false, message: 'Mật khẩu phải tối thiểu 8 ký tự.' }, 400);
    }

    try {
      const [existingUser]: any = await db.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existingUser.length > 0) {
        return c.json({ success: false, message: 'Username hoặc Email đã được sử dụng.' }, 409);
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      await db.execute(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, hashedPassword]
      );

      return c.json({ success: true, message: '🎉 Đăng ký tài khoản thành công!' }, 201);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  // --- UC-17: ĐĂNG NHẬP HỆ THỐNG ---
  static async signin(c: Context) {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ success: false, message: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu.' }, 400);
    }

    try {
      const [rows]: any = await db.execute(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, username]
      );

      if (rows.length === 0) {
        return c.json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác.' }, 401);
      }

      const user = rows[0];

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return c.json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác.' }, 401);
      }

      // Lưu ý: Đổi payload từ userId thành id để đồng bộ với bộ giải mã token ở ProjectController
      const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Lưu trữ token vào HttpOnly Cookie bảo mật cao chống tấn công XSS
      setCookie(c, 'auth_token', token, {
        path: '/',
        httpOnly: true,
        secure: false, // Để false chạy dưới HTTP localhost
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60
      });

      return c.json({
        success: true,
        message: '🎉 Đăng nhập thành công!',
        user: { id: user.id, username: user.username, email: user.email }
      }, 200);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  // =========================================================================
  // UC-18: ĐĂNG XUẤT HỆ THỐNG (Đã sửa thành Static Method chuẩn Class)
  // =========================================================================
  static async signout(c: Context) {
    try {
      // Đã sửa: Đồng bộ 100% các tham số path, secure, sameSite với lúc setCookie để trình duyệt chịu xóa
      deleteCookie(c, 'auth_token', {
        path: '/',
        httpOnly: true,
        secure: false, 
        sameSite: 'Lax',
      });

      return c.json({
        success: true,
        message: 'Đăng xuất tài khoản thành công!'
      }, 200);
    } catch (error: any) {
      return c.json({
        success: false,
        message: 'Lỗi hệ thống khi đăng xuất: ' + error.message
      }, 500);
    }
  }
}