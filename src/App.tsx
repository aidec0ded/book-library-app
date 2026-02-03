import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { BookList } from "@/pages/BookList";
import { BookDetail } from "@/pages/BookDetail";
import { SeasonalBooks } from "@/pages/SeasonalBooks";
import { VibesPage } from "@/pages/VibesPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<BookList />} />
        <Route path="seasonal" element={<SeasonalBooks />} />
        <Route path="vibes" element={<VibesPage />} />
        <Route path="books/:id" element={<BookDetail />} />
      </Route>
    </Routes>
  );
}
