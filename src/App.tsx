import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './contexts/StoreContext'
import { AccountPage } from './pages/AccountPage'
import { AboutPage, CatalogPage, HomePage, SupportPage } from './pages/PublicPages'
import { StaffPage } from './pages/StaffPage'
import { PublicLayout } from './components/Storefront'

export function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="products" element={<CatalogPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="support" element={<SupportPage />} />
          </Route>
          <Route path="admin" element={<StaffPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
