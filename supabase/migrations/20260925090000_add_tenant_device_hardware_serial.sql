ALTER TABLE public.tenant_devices
  ADD COLUMN IF NOT EXISTS hardware_serial text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_devices_tenant_vendor_hardware_serial_unique
  ON public.tenant_devices (
    tenant_id,
    vendor,
    lower(hardware_serial)
  )
  WHERE deleted_at IS NULL
    AND vendor_channel_id IS NULL
    AND hardware_serial IS NOT NULL;

COMMENT ON COLUMN public.tenant_devices.hardware_serial IS
  '用户从设备标签录入的机身SN；不同于腾讯云DeviceId等第三方平台标识';
