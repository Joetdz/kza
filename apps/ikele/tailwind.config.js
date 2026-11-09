/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // The storefront pages Ikele borrows from the Kzion web app.
    '../web/src/pages/PublicStore.tsx',
    '../web/src/pages/CustomerAccount.tsx',
  ],
  theme: { extend: {} },
  plugins: [],
}
