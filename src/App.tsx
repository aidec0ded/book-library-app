import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
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

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
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
