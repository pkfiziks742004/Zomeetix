const server = process.env.REACT_APP_SERVER_URL || "http://localhost:8000";
const adminSetupKey = process.env.REACT_APP_ADMIN_SETUP_KEY || "";

export default server;
export { adminSetupKey };
