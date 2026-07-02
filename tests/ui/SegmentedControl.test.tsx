import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl } from '@/components/SegmentedControl';

describe('SegmentedControl', () => {
  const options = [
    { value: 'morning' as const, label: 'Mañana' },
    { value: 'afternoon' as const, label: 'Tarde' },
  ];

  it('renders every option and marks the selected one', async () => {
    await render(<SegmentedControl options={options} value="morning" onChange={jest.fn()} />);
    expect(screen.getByText('Mañana')).toBeOnTheScreen();
    expect(screen.getByText('Tarde')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mañana').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Tarde').props.accessibilityState.selected).toBe(false);
  });

  it('fires onChange with the pressed value', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={options} value="morning" onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Tarde'));
    expect(onChange).toHaveBeenCalledWith('afternoon');
  });
});
