import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const expected = {
  './controllers/adminController.js': ['createMess','getAllMesses','updateMess','assignPMCToMess','createUser','getAllUsers','updateUser'],
  './controllers/authController.js': ['login'],
  './controllers/bookingController.js': ['createBooking','getMyBookings','getBookingById','cancelBooking','getMessBookings','checkIn','checkOut'],
  './controllers/dashboardController.js': ['getDashboard'],
  './controllers/managerController.js': ['getMyProfile','updateMyProfile','changePassword','getMyMess','getManagerBookings','approveBooking','rejectBooking'],
  './controllers/messController.js': ['createMess','getAllMesses','getMessesByCity','getMessById','assignMessStaff'],
  './controllers/notificationController.js': ['getMyNotifications','markNotificationRead','markAllNotificationsRead'],
  './controllers/paymentController.js': ['getBill','getMyBills','createPaymentOrder','verifyPayment'],
  './controllers/pmcController.js': ['getMyMess','updateManager','updateSecretary','changePMCPassword','getPMCBookings','approveBooking','rejectBooking'],
  './controllers/roomController.js': ['createRoom','getRooms','updateRoom','getAvailableRooms'],
  './controllers/secretaryController.js': ['getMyMess','getMyProfile','updateMyProfile','changePassword','getSecretaryBookings','approveBooking','rejectBooking'],
  './controllers/staffController.js': ['addBookingCharge','getBookingCharges'],
  './controllers/userController.js': ['getMyProfile','updateMyProfile','changePassword','getMyBookings','getUpcomingBookings','getMyBookingById','cancelBooking']
};
for (const [mod, names] of Object.entries(expected)) {
  const m = await import(pathToFileURL(path.resolve(mod)).href);
  for (const n of names) if (typeof m[n] !== 'function') throw new Error(`${mod} missing ${n}`);
}
for (const f of fs.readdirSync('./routes').filter(x=>x.endsWith('.js'))) await import(pathToFileURL(path.resolve('./routes',f)).href);
console.log('API CONTRACT TEST: PASS');
