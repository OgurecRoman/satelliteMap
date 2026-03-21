import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
jest.mock('./components/SatelliteTracker', () => function MockSatelliteTracker() { return <div>Тестовая 2D-карта</div>; });
jest.mock('./components/Earth3D', () => function MockEarth3D() { return <div>Тестовый 3D-глобус</div>; });
test('рендерит переключатель режимов и переключается в 3D', () => { render(<App />); expect(screen.getByText(/Платформа мониторинга пролётов спутников/i)).toBeInTheDocument(); expect(screen.getByText(/Тестовая 2D-карта/i)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /3D-глобус/i })); expect(screen.getByText(/Тестовый 3D-глобус/i)).toBeInTheDocument(); });
