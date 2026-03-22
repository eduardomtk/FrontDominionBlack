import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="admin-sidebar">
      <h2 className="admin-logo">Dominion Black Admin</h2>

      <nav>
        <NavLink to="/adm">Dashboard</NavLink>
        <NavLink to="/adm/users">Usuários</NavLink>
        <NavLink to="/adm/users-wallets">Carteiras</NavLink>
        <NavLink to="/adm/kyc">KYC</NavLink>
        <NavLink to="/adm/markets">Mercados</NavLink>
        <NavLink to="/adm/deposits">Depósitos</NavLink>
        <NavLink to="/adm/withdraws">Saques</NavLink>
        <NavLink to="/adm/trades">Operações</NavLink>
        <NavLink to="/adm/bonuses">Bônus</NavLink>
        <NavLink to="/adm/affiliates">Afiliados</NavLink>
        <NavLink to="/adm/support">Suporte</NavLink>
        <NavLink to="/adm/settings">Configurações</NavLink>
        <NavLink to="/adm/ranking">Ranking</NavLink>
      </nav>
    </aside>
  );
}