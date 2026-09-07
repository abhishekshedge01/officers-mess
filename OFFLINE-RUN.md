# Officers Mess - Razorpay Demo Run

The project now uses Razorpay Standard Checkout for bill payments. UPI is prioritised in the checkout. Use Razorpay Test Mode keys for a judge demonstration.

## Environment
Backend `.env`:
```env
PAYMENT_MODE=RAZORPAY
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
```
Frontend `.env`:
```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxx
```

Never put the Razorpay Key Secret in React or expose it in browser code.
