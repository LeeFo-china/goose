import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Gb28181AccessDetails } from "@/components/cameras/gb28181-onboarding-access";

test("shows only the GB28181 values an installer must enter", () => {
  const html = renderToStaticMarkup(
    <Gb28181AccessDetails
      device={{
        device_id: "device-id",
        sip_username: "sip-user",
        sip_password: "sip-password",
        sip_transport_protocol: "TCP",
      }}
      sipServer={{
        sip_server_id: "server-id",
        sip_domain: "server-domain",
        sip_host: "server-host",
        sip_port: 5060,
        transport_protocol: "TCP",
        request_id: null,
      }}
    />,
  );

  for (const label of [
    "SIP服务器地址",
    "SIP服务器端口",
    "SIP服务器ID",
    "SIP服务器域",
    "设备ID / 用户名",
    "认证密码",
    "传输协议",
  ]) {
    expect(html).toContain(label);
  }
  expect(html).not.toContain("设备类型");
  expect(html).not.toContain("安装位置");
});
