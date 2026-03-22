import { useEffect, useState } from "react";
import { fetchAdminDashboard } from "../../services/admin.api";
import DashboardCard from "../../components/DashboardCard";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchAdminDashboard().then(setData);
  }, []);

  if (!data) {
    return <p>Carregando dashboard...</p>;
  }

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="dashboard-grid">
        <DashboardCard
          title="Total de Depósitos"
          value={`R$ ${data.deposits.toLocaleString("pt-BR")}`}
          subtitle="Volume total depositado"
        />

        <DashboardCard
          title="Total de Saques"
          value={`R$ ${data.withdraws.toLocaleString("pt-BR")}`}
          subtitle="Volume total sacado"
        />

        <DashboardCard
          title="Ticket Médio"
          value={`R$ ${data.ticketAverage.toLocaleString("pt-BR")}`}
          subtitle="Média por operação"
        />

        <DashboardCard
          title="Total de Usuários"
          value={data.totalUsers.toLocaleString("pt-BR")}
          subtitle="Usuários cadastrados"
        />

        <DashboardCard
          title="Saldo dos Usuários"
          value={`R$ ${data.totalBalance.toLocaleString("pt-BR")}`}
          subtitle="Saldo total em contas"
        />

        <DashboardCard
          title="Ganho da Plataforma"
          value={`R$ ${data.platformProfit.toLocaleString("pt-BR")}`}
          subtitle="Lucro líquido"
        />
      </div>
    </div>
  );
}
