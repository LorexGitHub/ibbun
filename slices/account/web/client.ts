import { createContext, useContext } from "react";
import { createLearnerClient, type LearnerClient } from "@ibbun/learner/client";

/** Screens read the client from here, so tests can hand them a fake. */
export const ClientContext = createContext<LearnerClient>(createLearnerClient());

export const useClient = (): LearnerClient => useContext(ClientContext);
