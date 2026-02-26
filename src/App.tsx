import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import NewTrade from "./pages/NewTrade";
import TradeLog from "./pages/TradeLog";
import Review from "./pages/Review";
import Analytics from "./pages/Analytics";
import Journal from "./pages/Journal";
import Playbook from "./pages/Playbook";
import News from "./pages/News";
import Settings from "./pages/Settings";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="new-trade" element={<NewTrade />} />
        <Route path="trade-log" element={<TradeLog />} />
        <Route path="review" element={<Review />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="journal" element={<Journal />} />
        <Route path="playbook" element={<Playbook />} />
        <Route path="news" element={<News />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
