import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Connectivity hook for offline banners and sync hints. `null` means still
 * unknown (first NetInfo callback pending); screens treat it as online to
 * avoid flashing offline states at startup.
 */
export function useIsOnline(): boolean | null {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  return isOnline;
}
