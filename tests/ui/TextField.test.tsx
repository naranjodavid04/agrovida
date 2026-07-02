import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextField } from '@/components/TextField';

describe('TextField', () => {
  it('links the label to the input for screen readers', async () => {
    await render(<TextField label="Litros" value="" onChangeText={jest.fn()} />);
    expect(screen.getByText('Litros')).toBeOnTheScreen();
    expect(screen.getByLabelText('Litros')).toBeOnTheScreen();
  });

  it('propagates text changes', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Litros" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Litros'), '12.5');
    expect(onChangeText).toHaveBeenCalledWith('12.5');
  });

  it('announces errors with an alert role', async () => {
    await render(
      <TextField label="Litros" value="-1" onChangeText={jest.fn()} error="Cantidad inválida" />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Cantidad inválida');
  });
});
