import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { logoutTeamUser } from "../services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return logoutTeamUser(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return logoutTeamUser(request);
}
