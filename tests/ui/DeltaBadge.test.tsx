import { render, screen } from '@testing-library/react-native';

import { DeltaBadge } from '@/components/DeltaBadge';

/** Yesterday comparison communicates direction with sign + text, not color. */
describe('DeltaBadge', () => {
  it('shows "no comparison" when delta is null', async () => {
    await render(<DeltaBadge delta={null} />);
    expect(screen.getByText(/Sin comparación/)).toBeOnTheScreen();
  });

  it('marks increases with an up arrow and plus sign', async () => {
    await render(<DeltaBadge delta={2.34} />);
    expect(screen.getByText(/▲ \+2\.3 L · vs\. ayer/)).toBeOnTheScreen();
  });

  it('marks decreases with a down arrow', async () => {
    await render(<DeltaBadge delta={-1.5} />);
    expect(screen.getByText(/▼ -1\.5 L/)).toBeOnTheScreen();
  });

  it('treats zero as neutral', async () => {
    await render(<DeltaBadge delta={0} />);
    expect(screen.getByText(/= 0 L/)).toBeOnTheScreen();
  });
});
