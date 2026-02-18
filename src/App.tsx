import { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { fetchOnboardingStatus } from "@/lib/onboarding";

// Lazy-loaded pages — each gets its own chunk
const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })));
const BookList = lazy(() => import("@/pages/BookList").then((m) => ({ default: m.BookList })));
const BookDetail = lazy(() => import("@/pages/BookDetail").then((m) => ({ default: m.BookDetail })));
const RecommendationsPage = lazy(() => import("@/pages/RecommendationsPage").then((m) => ({ default: m.RecommendationsPage })));
const AddBook = lazy(() => import("@/pages/AddBook").then((m) => ({ default: m.AddBook })));
const ImportBooks = lazy(() => import("@/pages/ImportBooks").then((m) => ({ default: m.ImportBooks })));
const Chat = lazy(() => import("@/pages/Chat").then((m) => ({ default: m.Chat })));
const Profile = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const SyllabiPage = lazy(() => import("@/pages/SyllabiPage").then((m) => ({ default: m.SyllabiPage })));
const SyllabusDetail = lazy(() => import("@/pages/SyllabusDetail").then((m) => ({ default: m.SyllabusDetail })));
const ReleasesPage = lazy(() => import("@/pages/ReleasesPage").then((m) => ({ default: m.ReleasesPage })));
const PhilosophyPage = lazy(() => import("@/pages/PhilosophyPage").then((m) => ({ default: m.PhilosophyPage })));
const FeaturesPage = lazy(() => import("@/pages/FeaturesPage").then((m) => ({ default: m.FeaturesPage })));
const ContactPage = lazy(() => import("@/pages/ContactPage").then((m) => ({ default: m.ContactPage })));
const PricingPage = lazy(() => import("@/pages/PricingPage").then((m) => ({ default: m.PricingPage })));
const FAQPage = lazy(() => import("@/pages/FAQPage").then((m) => ({ default: m.FAQPage })));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })));

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <Spinner />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "complete" | "incomplete">("loading");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    void (async () => {
      try {
        const completed = await fetchOnboardingStatus();
        if (!cancelled) {
          setStatus(completed ? "complete" : "incomplete");
        }
      } catch {
        // If we can't check, let them through
        if (!cancelled) setStatus("complete");
      }
    })();

    return () => { cancelled = true; };
  }, [session]);

  if (status === "loading") {
    return <Spinner />;
  }

  // Allow /import during onboarding (user needs to import Goodreads data)
  const isImportPage = location.pathname === "/import";
  if (status === "incomplete" && !isImportPage) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route index element={<LandingPage />} />
        <Route path="philosophy" element={<PhilosophyPage />} />
        <Route path="features" element={<FeaturesPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="faq" element={<FAQPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route
          path="onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <OnboardingGate>
                <Layout />
              </OnboardingGate>
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
          <Route path="settings" element={<Settings />} />
          <Route path="add" element={<AddBook />} />
          <Route path="import" element={<ImportBooks />} />
          <Route path="books/:id" element={<BookDetail />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
