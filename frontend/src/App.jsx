import { AnimatePresence } from "framer-motion";
import { SnackbarProvider } from "notistack";
import {
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
} from "react-router-dom";
import "./App.css";
import ErrorBoundary from "./components/common/ErrorBoundary";
import ProtectedRoute from "./components/common/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import Authentication from "./pages/authentication";
import History from "./pages/history";
import HomeComponent from "./pages/home";
import LandingPage from "./pages/landing";
import ResetPassword from "./pages/resetPassword";
import VerifyEmail from "./pages/verifyEmail";
import VideoMeetComponent from "./pages/VideoMeet";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<Authentication />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomeComponent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route path="/:url" element={<VideoMeetComponent />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <SnackbarProvider
        maxSnack={3}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Router>
          <AuthProvider>
            <AnimatedRoutes />
          </AuthProvider>
        </Router>
      </SnackbarProvider>
    </ErrorBoundary>
  );
}

export default App;
