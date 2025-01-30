module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"], // Ensure all your files are scanned
  theme: {
    extend: {
      colors: {
        sidebar: "#1F2937", // Custom sidebar color
        primary: "#4F46E5", // Accent purple
        secondary: "#6B7280", // Text gray
      },
      borderRadius: {
        large: "12px", // Rounded corners
      },
      boxShadow: {
        card: "0 4px 6px rgba(0, 0, 0, 0.1)", // Sleek card shadows
      },
    },
  },
  plugins: [],
};