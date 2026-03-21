import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./components/SatelliteTracker', () => function MockSatelliteTracker() {
  return <div>Mock 2D map</div>;
});

jest.mock('./components/Earth3D', () => function MockEarth3D() {
  return <div>Mock 3D globe</div>;
});

test('renders view mode toggle and switches to 3D', () => {
  render(<App />);
  expect(screen.getByText(/Satellite pass monitoring platform/i)).toBeInTheDocument();
  expect(screen.getByText(/Mock 2D map/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /3D globe/i }));
  expect(screen.getByText(/Mock 3D globe/i)).toBeInTheDocument();
});
