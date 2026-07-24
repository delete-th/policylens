import { createContext, useContext, useState } from "react";

const Store = createContext(null);
export const useStore = () => useContext(Store);

export function StoreProvider({ children }) {
  const [page, setPage]                       = useState("upload");
  const [activeFindingId, setActiveFindingId] = useState("f1");
  const [decisions, setDecisions]             = useState({});
  // uploadedFile is set when the reviewer picks a contract on the Upload page.
  // The context search runs against CONTRACT_CLAUSES using this as a trigger.
  const [uploadedFile, setUploadedFile]       = useState(null);

  const setDecision = (id, decision) =>
    setDecisions((d) => ({ ...d, [id]: decision }));

  return (
    <Store.Provider value={{
      page, setPage,
      activeFindingId, setActiveFindingId,
      decisions, setDecision,
      uploadedFile, setUploadedFile,
    }}>
      {children}
    </Store.Provider>
  );
}
