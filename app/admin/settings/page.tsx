import { requireAdmin } from '@/lib/admin-auth'
import { IntegrationSettingsForm } from '@/components/integration-settings-form'
export default async function SettingsPage() { await requireAdmin(); return <main className="admin-content" dir="ltr"><div className="admin-detail"><section><h2>General</h2><p>Store name</p><strong>yourmachinesewing</strong></section></div><h2 className="admin-section-title">Integrations</h2><IntegrationSettingsForm /></main> }
