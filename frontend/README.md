# Officers Mess Frontend

Simple React + Vite + Bootstrap frontend.

## Structure
- `src/App.jsx` - routes
- `src/main.jsx` - React entry point
- `src/services/api.js` - Axios/auth
- `src/constants/` - roles/categories/helpers
- `src/components/` - reusable UI/auth guards
- `src/layouts/` - application shell/sidebar
- `src/pages/` - feature pages

## Run
```bash
npm install
npm run dev
```

Set `.env`:
```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
```


## Razorpay + UPI
The Bills page uses Razorpay Standard Checkout. UPI is explicitly prioritised in the Checkout configuration. Add the Razorpay **Key ID** to `frontend/.env`. Keep the **Key Secret only in `backend/.env`**. Never expose the secret in React or commit it to source control. Use Razorpay Test Mode keys for judge demonstrations.
