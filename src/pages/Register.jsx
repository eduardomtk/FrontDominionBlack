import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { signUp } = useAuth();

  const [form, setForm] = useState({
    name: "",
    cpf: "",
    phone: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signUp(form);
      alert("Conta criada com sucesso!");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Nome" onChange={handleChange} />
      <input name="cpf" placeholder="CPF" onChange={handleChange} />
      <input name="phone" placeholder="Telefone" onChange={handleChange} />
      <input name="email" placeholder="Email" onChange={handleChange} />
      <input name="password" type="password" placeholder="Senha" onChange={handleChange} />
      <button type="submit">Criar conta</button>
    </form>
  );
}
