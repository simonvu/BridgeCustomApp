import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Select,
  TextField,
  Tabs,
  Box,
} from "@shopify/polaris";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const roleName = currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN";

  // Demo Shopify Orders Data
  const mockOrders = [
    {
      id: "#1001",
      orderNumber: "577530863834861644",
      date: "Today, 10:42 AM",
      customer: "Karen Sharrer",
      status: "Awaiting Shipment",
      tone: "attention" as const,
      shippingFee: "$4.44",
      total: "$25.94",
      shippingMethod: "Shopify Shipping",
      items: "Custom Graphic T-Shirt x 1",
    },
    {
      id: "#1002",
      orderNumber: "577530881427149492",
      date: "Today, 09:15 AM",
      customer: "John Gayla Duerr",
      status: "Awaiting Shipment",
      tone: "attention" as const,
      shippingFee: "$8.39",
      total: "$23.88",
      shippingMethod: "Standard Delivery",
      items: "Personalized Ceramic Mug x 2",
    },
  ];

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName,
    },
    orders: mockOrders,
  });
}

export default function AppDashboardRoute() {
  const { currentUser, orders } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(1);
  const [queryValue, setQueryValue] = useState("");
  const [shippingFilter, setShippingFilter] = useState("all");

  const handleTabChange = useCallback((selectedTabIndex: number) => setSelectedTab(selectedTabIndex), []);

  const tabs = [
    { id: "all", content: "All Orders", badge: "9,999+" },
    { id: "awaiting-shipment", content: "Awaiting Shipment", badge: "2" },
    { id: "awaiting-collection", content: "Awaiting Collection", badge: "215" },
    { id: "shipped", content: "Shipped", badge: "4,174" },
    { id: "completed", content: "Completed", badge: "9,999+" },
  ];

  const shippingOptions = [
    { label: "All Shipping Methods", value: "all" },
    { label: "Shopify Shipping", value: "shopify" },
    { label: "Standard Delivery", value: "standard" },
  ];

  const resourceName = {
    singular: "order",
    plural: "orders",
  };

  const rowMarkup = orders.map(
    ({ id, orderNumber, date, customer, status, tone, shippingFee, total, shippingMethod, items }, index) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {id}
            </Text>
            <Text variant="bodyXs" tone="subdued" as="span">
              {orderNumber}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{date}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {customer}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={tone}>{status}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{items}</IndexTable.Cell>
        <IndexTable.Cell>{shippingFee}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {total}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone="info">{shippingMethod}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="end">
            <Button size="micro" variant="secondary">
              View
            </Button>
            <Button size="micro" variant="tertiary">
              Sync
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="Orders"
        subtitle="Manage and fulfill customer orders seamlessly with Shopify Admin UI"
        primaryAction={{
          content: "Export Orders",
          onAction: () => {},
        }}
      >
        <Layout>
          {/* Top Metric Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap={false}>
              <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="span">
                    Today Orders
                  </Text>
                  <Text variant="headingXl" as="h2" tone="success">
                    43
                  </Text>
                </BlockStack>
              </div>

              <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="span">
                    Yesterday Orders
                  </Text>
                  <Text variant="headingXl" as="h2">
                    70
                  </Text>
                </BlockStack>
              </div>

              <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="span">
                    Last 7 Days
                  </Text>
                  <Text variant="headingXl" as="h2">
                    760
                  </Text>
                </BlockStack>
              </div>
            </InlineStack>
          </Layout.Section>

          {/* Main Table Card with Tabs */}
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <Box padding="400">
                  <InlineStack gap="300" align="space-between">
                    <div className="flex-1">
                      <TextField
                        label="Search orders"
                        labelHidden
                        value={queryValue}
                        onChange={setQueryValue}
                        placeholder="Search by order ID, customer name..."
                        autoComplete="off"
                      />
                    </div>
                    <div className="w-64">
                      <Select
                        label="Filter Shipping"
                        labelHidden
                        options={shippingOptions}
                        value={shippingFilter}
                        onChange={setShippingFilter}
                      />
                    </div>
                  </InlineStack>
                </Box>

                <IndexTable
                  resourceName={resourceName}
                  itemCount={orders.length}
                  selectable={false}
                  headings={[
                    { title: "Order" },
                    { title: "Date" },
                    { title: "Customer" },
                    { title: "Status" },
                    { title: "Items" },
                    { title: "Shipping Fee" },
                    { title: "Total" },
                    { title: "Method" },
                    { title: "Actions", alignment: "end" },
                  ]}
                >
                  {rowMarkup}
                </IndexTable>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
