import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { Home } from "@/pages/Home";
import { BookList } from "@/pages/BookList";
import { BookDetail } from "@/pages/BookDetail";
import { RecommendationsPage } from "@/pages/RecommendationsPage";
import { AddBook } from "@/pages/AddBook";
import { Chat } from "@/pages/Chat";
import { Profile } from "@/pages/Profile";
import { SyllabiPage } from "@/pages/SyllabiPage";
import { SyllabusDetail } from "@/pages/SyllabusDetail";
import { ReleasesPage } from "@/pages/ReleasesPage";
import { PhilosophyPage } from "@/pages/PhilosophyPage";
import { FeaturesPage } from "@/pages/FeaturesPage";
import { ContactPage } from "@/pages/ContactPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="philosophy" element={<PhilosophyPage />} />
      <Route path="features" element={<FeaturesPage />} />
      <Route path="contact" element={<ContactPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="home" element={<Home />} />
        <Route path="library" element={<BookList />} />
        <Route path="recommendations" element={<RecommendationsPage />} />
        <Route path="syllabi" element={<SyllabiPage />} />
        <Route path="syllabi/:id" element={<SyllabusDetail />} />
        <Route path="releases" element={<ReleasesPage />} />
        <Route path="chat" element={<Chat />} />
        <Route path="profile" element={<Profile />} />
        <Route path="add" element={<AddBook />} />
        <Route path="books/:id" element={<BookDetail />} />
      </Route>
    </Routes>
  );
}
