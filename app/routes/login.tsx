import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  Banner,
  BlockStack,
  Box,
  InlineStack,
  AppProvider,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";
import { authenticateTeamUser, createUserSession, getTeamUserId } from "../services/auth.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getTeamUserId(request);
  if (userId) {
    return redirect("/app/team/users");
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/app/team/users";

  if (!email || !password) {
    return json({ error: "Please enter both Email and Password" }, { status: 400 });
  }

  const user = await authenticateTeamUser(email, password);
  if (!user) {
    return json({ error: "Invalid email or password, or account is disabled" }, { status: 400 });
  }

  return createUserSession(user.id, redirectTo);
}

export default function LoginRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [email, setEmail] = useState("admin@bridgecustom.com");
  const [password, setPassword] = useState("admin123");

  const isSubmitting = navigation.state === "submitting";

  const handleSubmit = () => {
    submit({ email, password }, { method: "post" });
  };

  return (
    <AppProvider i18n={{}}>
      <Box padding="800" minHeight="100vh" background="bg-surface-secondary">
        <InlineStack align="center" blockAlign="center">
          <Box width="420px">
            <Card padding="600">
              <BlockStack gap="400">
                <BlockStack gap="200" align="center">
                  <div className="flex justify-center mb-1">
                    <img
                      src="https://bridgecustom.com/cdn/shop/files/logo_32560765-de91-4766-9226-9630dcbf7d4a.png"
                      alt="BridgeCustom Logo"
                      className="h-10 w-auto object-contain"
                    />
                  </div>
                  <Text variant="headingLg" as="h1" alignment="center">
                    BridgeCustom App
                  </Text>
                  <Text variant="bodyMd" tone="subdued" alignment="center">
                    Team Admin Portal Sign In
                  </Text>
                </BlockStack>

                {actionData?.error && (
                  <Banner tone="critical" title="Authentication Error">
                    <p>{actionData.error}</p>
                  </Banner>
                )}

                <FormLayout>
                  <TextField
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    placeholder="admin@bridgecustom.com"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                  />
                  <Button
                    variant="primary"
                    size="large"
                    fullWidth
                    loading={isSubmitting}
                    onClick={handleSubmit}
                  >
                    Sign In
                  </Button>
                </FormLayout>

                <Box paddingBlockStart="200">
                  <Banner tone="info">
                    <Text variant="bodySm">
                      💡 <strong>Default Admin Credentials:</strong>
                      <br />
                      Email: <code>admin@bridgecustom.com</code>
                      <br />
                      Password: <code>admin123</code>
                    </Text>
                  </Banner>
                </Box>
              </BlockStack>
            </Card>
          </Box>
        </InlineStack>
      </Box>
    </AppProvider>
  );
}
