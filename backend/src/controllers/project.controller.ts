import { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../../database/connection';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

const getUserIdFromCookie = (c: Context): number | null => {
  const token = getCookie(c, 'auth_token');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    return decoded.id;
  } catch (err) {
    return null;
  }
};

export class ProjectController {
  static async create(c: Context) {
    const userId = getUserIdFromCookie(c);
    if (!userId) return c.json({ success: false, message: 'Hết phiên đăng nhập, vui lòng đăng nhập lại.' }, 401);

    const { name, sourceCode } = await c.req.json();
    if (!name) return c.json({ success: false, message: 'Tên dự án không được để trống.' }, 400);

    try {
      const [result]: any = await db.execute(
        'INSERT INTO projects (user_id, name, source_code) VALUES (?, ?, ?)',
        [userId, name, sourceCode ?? '']
      );
      return c.json({ success: true, projectId: result.insertId, message: 'Tạo dự án mới thành công!' }, 201);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  static async list(c: Context) {
    const userId = getUserIdFromCookie(c);
    if (!userId) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401);

    try {
      const [rows]: any = await db.execute(
        'SELECT id, name, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
        [userId]
      );
      return c.json({ success: true, projects: rows }, 200);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  static async save(c: Context) {
    const userId = getUserIdFromCookie(c);
    if (!userId) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401);

    const projectId = c.req.param('id');
    const { sourceCode } = await c.req.json();

    try {
      const [rows]: any = await db.execute(
        'SELECT id FROM projects WHERE id = ? AND user_id = ?',
        [String(projectId), userId]
      );
      if (rows.length === 0) return c.json({ success: false, message: 'Không tìm thấy dự án hoặc bạn không có quyền sửa.' }, 403);

      await db.execute(
        'UPDATE projects SET source_code = ? WHERE id = ?',
        [sourceCode ?? '', String(projectId)]
      );
      return c.json({ success: true, message: 'Đã lưu thay đổi vào hệ thống!' }, 200);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  static async delete(c: Context) {
    const userId = getUserIdFromCookie(c);
    if (!userId) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401);

    const projectId = c.req.param('id');

    try {
      const [rows]: any = await db.execute(
        'SELECT id FROM projects WHERE id = ? AND user_id = ?',
        [String(projectId), userId]
      );
      if (rows.length === 0) return c.json({ success: false, message: 'Không có quyền xóa dự án này.' }, 403);

      await db.execute('DELETE FROM projects WHERE id = ?', [String(projectId)]);
      return c.json({ success: true, message: 'Xóa dự án thành công!' }, 200);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  static async getDetail(c: Context) {
    const userId = getUserIdFromCookie(c);
    if (!userId) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401);

    const projectId = c.req.param('id');

    try {
      const [rows]: any = await db.execute(
        'SELECT id, name, source_code, updated_at FROM projects WHERE id = ? AND user_id = ?',
        [String(projectId), userId]
      );

      if (rows.length === 0) {
        return c.json({ success: false, message: 'Không tìm thấy dự án hoặc bạn không có quyền xem.' }, 403);
      }

      return c.json({ success: true, project: rows[0] }, 200);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }

  static async rename(c: Context) {
    const userId = getUserIdFromCookie(c);
    if (!userId) return c.json({ success: false, message: 'Chưa đăng nhập.' }, 401);

    const projectId = c.req.param('id');
    const { newName } = await c.req.json();

    if (!newName || !newName.trim()) {
      return c.json({ success: false, message: 'Tên mới của dự án không được để trống.' }, 400);
    }

    try {
      // Bảo mật: Kiểm tra quyền sở hữu dự án trước khi đổi tên
      const [rows]: any = await db.execute(
        'SELECT id FROM projects WHERE id = ? AND user_id = ?',
        [String(projectId), userId]
      );
      if (rows.length === 0) {
        return c.json({ success: false, message: 'Không có quyền chỉnh sửa dự án này.' }, 403);
      }

      // Thực thi cập nhật tên mới vào DB
      await db.execute(
        'UPDATE projects SET name = ?, updated_at = NOW() WHERE id = ?',
        [newName.trim(), String(projectId)]
      );

      return c.json({ success: true, message: '✏️ Đổi tên dự án thành công!' }, 200);
    } catch (error: any) {
      return c.json({ success: false, message: 'Lỗi hệ thống: ' + error.message }, 500);
    }
  }
}