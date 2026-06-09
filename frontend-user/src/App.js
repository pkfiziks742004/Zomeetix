import './App.css';
import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import LandingPage from './pages/landing';
import Authentication from './pages/authentication';
import ResetPassword from './pages/resetPassword';
import { AuthProvider } from './contexts/AuthContext';
import HomeComponent from './pages/home';
import History from './pages/history';
import JoinMeeting from './pages/joinMeeting';
import HostMeeting from './pages/hostMeeting';
import ScheduledMeetings from './pages/scheduledMeetings';
import OnboardingPage from './pages/onboarding';
import ProfilePage from './pages/profile';

const VideoMeetComponent = lazy(() => import('./pages/VideoMeet'));

function App() {
  return (
    <div className="App">
      <Router>
        <AuthProvider>
          <Suspense
            fallback={
              <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
                Loading...
              </div>
            }
          >
            <Routes>
              <Route path='/' element={<LandingPage />} />
              <Route path='/auth' element={<Authentication />} />
              <Route path='/reset-password' element={<ResetPassword />} />
              <Route path='/onboarding' element={<OnboardingPage />} />
              <Route path='/home' element={<HomeComponent />} />
              <Route path='/join' element={<JoinMeeting />} />
              <Route path='/host' element={<HostMeeting />} />
              <Route path='/host/scheduled' element={<ScheduledMeetings />} />
              <Route path='/host/recordings' element={<Navigate to="/host" replace />} />
              <Route path='/history' element={<History />} />
              <Route path='/profile' element={<ProfilePage />} />
              <Route path='/meeting/:roomId' element={<VideoMeetComponent />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </Router>
    </div>
  );
}

export default App;
