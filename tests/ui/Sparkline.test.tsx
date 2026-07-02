import { render, screen } from '@testing-library/react-native';

import { Sparkline } from '@/components/Sparkline';

describe('Sparkline', () => {
  it('exposes an accessible description of the trend', async () => {
    await render(<Sparkline values={[1, 2, 3, 4, 5, 6, 7]} />);
    expect(
      screen.getByLabelText('Tendencia de producción de los últimos siete días'),
    ).toBeOnTheScreen();
  });

  it('renders with all-zero values without dividing by zero', async () => {
    await expect(render(<Sparkline values={[0, 0, 0, 0, 0, 0, 0]} />)).resolves.toBeDefined();
  });
});
