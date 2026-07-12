import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface PhoneStreamCtx {
  phoneStream: MediaStream | null;
  setPhoneStream: (s: MediaStream | null) => void;
}

const Ctx = createContext<PhoneStreamCtx>({
  phoneStream: null,
  setPhoneStream: () => {},
});

export const PhoneStreamProvider = ({ children }: { children: ReactNode }) => {
  const [phoneStream, setStreamState] = useState<MediaStream | null>(null);
  const setPhoneStream = useCallback((s: MediaStream | null) => {
    setStreamState((prev) => (prev === s ? prev : s));
  }, []);
  return <Ctx.Provider value={{ phoneStream, setPhoneStream }}>{children}</Ctx.Provider>;
};

export const usePhoneStream = () => useContext(Ctx);
