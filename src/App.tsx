import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { BookList } from "@/pages/BookList";
import { BookDetail } from "@/pages/BookDetail";
import { SeasonalBooks } from "@/pages/SeasonalBooks";
import { VibesPage } from "@/pages/VibesPage";
import { AddBook } from "@/pages/AddBook";
import { Chat } from "@/pages/Chat";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<BookList />} />
        <Route path="seasonal" element={<SeasonalBooks />} />
        <Route path="vibes" element={<VibesPage />} />
        <Route path="chat" element={<Chat />} />
        <Route path="add" element={<AddBook />} />
        <Route path="books/:id" element={<BookDetail />} />
      </Route>
    </Routes>
  );
}
