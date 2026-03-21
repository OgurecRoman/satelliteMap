//import './App.css';
//import SatelliteTracker from './components/SatelliteTracker';
//
//function App() {
//  return (
//    <div className="App">
//      <h1>Interactive 2D Earth</h1>
//      <SatelliteTracker />
//    </div>
//  );
//}
//
//export default App;

import './App.css';
import SatelliteTracker from './components/SatelliteTracker';

function App() {
  return (
    <div className="App">
      <div className="app-header">
        <h1 className="app-title">
          <span className="title-icon"></span>
          <span className="title-text">Мониторинг пролётов спутников</span>
        </h1>
      </div>
      <SatelliteTracker />
    </div>
  );
}

export default App;