import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RoleRoute({ allowedRole, children }) {
  const { role } = useAuth();

  if (role && role !== allowedRole) {
    return <Navigate to={`/${role}/dashboard`} replace />;
  }

  return children;
}
