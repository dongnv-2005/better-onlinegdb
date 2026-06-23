import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';
let socket: Socket | null = null;

export const getWebSocketService = (): Socket => {
  if (!socket) {
    // Khởi tạo kết nối Singleton duy nhất tới Backend
    socket = io(SOCKET_URL, {
      autoConnect: false, 
    });

    socket.on('connect', () => {
      console.log('[WS-Client] Đã kết nối thành công tới cổng Server 5000!');
    });

    socket.on('disconnect', () => {
      console.log('[WS-Client] Đã ngắt kết nối với Server.');
    });
  }
  return socket;
};