import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Lesson } from './pages/Lesson';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/level/:levelId/*" element={<Lesson />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
