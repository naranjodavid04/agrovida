import { render, screen } from '@testing-library/react-native';

import { StatusChips } from '@/components/StatusChips';

/**
 * D-005 / DESIGN_SPEC §6: independent dimensions as chips; an inactive
 * lifecycle replaces both; status is written out, never color alone.
 */
describe('StatusChips', () => {
  it('shows lactation and pregnancy chips together', async () => {
    await render(
      <StatusChips
        cow={{
          lifecycleStatus: 'active',
          lactationStatus: 'lactating',
          pregnancyStatus: 'pregnant',
        }}
      />,
    );
    expect(screen.getByText('Lactando')).toBeOnTheScreen();
    expect(screen.getByText('Preñada')).toBeOnTheScreen();
  });

  it('replaces both chips when the lifecycle is inactive', async () => {
    await render(
      <StatusChips
        cow={{ lifecycleStatus: 'sold', lactationStatus: 'lactating', pregnancyStatus: 'pregnant' }}
      />,
    );
    expect(screen.getByText('Vendida')).toBeOnTheScreen();
    expect(screen.queryByText('Lactando')).toBeNull();
    expect(screen.queryByText('Preñada')).toBeNull();
  });

  it('hides unknown states unless verbose', async () => {
    const cow = {
      lifecycleStatus: 'active',
      lactationStatus: 'unknown',
      pregnancyStatus: 'open',
    } as const;
    const { rerender } = await render(<StatusChips cow={cow} />);
    expect(screen.queryByText('Vacía')).toBeNull();

    await rerender(<StatusChips cow={cow} verbose />);
    expect(screen.getByText('Vacía')).toBeOnTheScreen();
    expect(screen.getByText('Lactancia sin datos')).toBeOnTheScreen();
  });

  it('shows the dry chip', async () => {
    await render(
      <StatusChips
        cow={{ lifecycleStatus: 'active', lactationStatus: 'dry', pregnancyStatus: 'unknown' }}
      />,
    );
    expect(screen.getByText('Seca')).toBeOnTheScreen();
  });
});
