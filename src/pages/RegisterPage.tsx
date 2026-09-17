import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all required fields.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long and contain letters and numbers.'); return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please enter the same password in both fields.'); return;
    }
    setLoading(true); setError(null);
    try {
      await register({ fullName: fullName.trim(), username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), phone: '', password });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your information.');
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-[#100709] flex items-center justify-center p-4 relative overflow-hidden py-10">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-[#7A1831]/10 rounded-full blur-[150px] pointer-events-none" />
    <div className="w-full max-w-lg nivo-glass-strong border border-[#8F1D3A]/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10">
      <div className="text-center mb-7">
        <Link to="/" className="inline-flex items-center gap-2.5 mb-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#7A1831] to-[#C13A5A] flex items-center justify-center shadow-lg"><Zap className="w-6 h-6 text-white fill-white" /></div>
          <span className="font-black text-2xl tracking-tight text-white">JB Boster</span>
        </Link>
        <h1 className="text-2xl font-black text-white">Create Your Account</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">Create your JB Boster account and start managing your social-media growth orders in one place.</p>
      </div>

      <div className="mb-6 bg-[#7A1831]/10 border border-[#C13A5A]/20 p-4 rounded-2xl flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-[#df6f8e] shrink-0 mt-0.5" />
        <div><p className="text-sm text-white font-black">Built for social growth</p><p className="text-xs text-slate-400 mt-1">Choose Facebook, Instagram, TikTok, YouTube and other social services, then pay with your JB Boster coins.</p></div>
      </div>

      {error && <div className="mb-5 p-3.5 bg-[#8F1D3A]/10 border border-[#8F1D3A]/30 rounded-xl text-[#f09ab1] text-xs flex items-center gap-2.5 font-semibold"><AlertCircle className="w-4 h-4 shrink-0"/><span>{error}</span></div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name *" icon={<User className="w-4 h-4"/>} value={fullName} setValue={setFullName} placeholder="John Doe" />
          <Field label="Username *" prefix="@" value={username} setValue={setUsername} placeholder="johndoe" />
        </div>
        <Field label="Email Address *" icon={<Mail className="w-4 h-4"/>} value={email} setValue={setEmail} placeholder="john@example.com" type="email" />
        <PasswordField label="Password *" value={password} setValue={setPassword} shown={showPassword} setShown={setShowPassword} placeholder="At least 8 characters" />
        <PasswordField label="Confirm Password *" value={confirmPassword} setValue={setConfirmPassword} shown={showConfirmPassword} setShown={setShowConfirmPassword} placeholder="Enter your password again" />
        {confirmPassword && <div className={`text-xs font-bold ${password === confirmPassword ? 'text-emerald-400' : 'text-rose-300'}`}>{password === confirmPassword ? '✓ Passwords match' : 'Passwords do not match'}</div>}
        <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-[#7A1831] to-[#A52A4A] hover:from-[#8F1D3A] hover:to-[#C13A5A] disabled:opacity-50 text-white font-black text-sm py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all mt-2">{loading ? 'Creating Account...' : 'Create JB Boster Account'}{!loading && <ArrowRight className="w-4 h-4"/>}</button>
      </form>
      <div className="mt-7 text-center text-xs text-slate-400 border-t border-white/10 pt-5">Already have an account? <Link to="/login" className="font-black text-[#C13A5A] hover:underline">Sign In</Link></div>
    </div>
  </div>;
};

function Field({label,icon,prefix,value,setValue,placeholder,type='text'}:{label:string;icon?:React.ReactNode;prefix?:string;value:string;setValue:(v:string)=>void;placeholder:string;type?:string}){
 return <div><label className="block text-xs font-bold text-slate-300 mb-1.5">{label}</label><div className="relative">{icon && <span className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>}{prefix && <span className="text-slate-400 text-xs font-bold absolute left-3.5 top-1/2 -translate-y-1/2">{prefix}</span>}<input type={type} required value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder} className={`w-full nivo-glass-surface border border-[#8F1D3A]/20 rounded-xl ${icon?'pl-10':prefix?'pl-8':'pl-4'} pr-4 py-3 text-white text-sm focus:outline-none focus:border-[#C13A5A] transition-colors`}/></div></div>
}
function PasswordField({label,value,setValue,shown,setShown,placeholder}:{label:string;value:string;setValue:(v:string)=>void;shown:boolean;setShown:(v:boolean)=>void;placeholder:string}){
 return <div><label className="block text-xs font-bold text-slate-300 mb-1.5">{label}</label><div className="relative"><Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"/><input type={shown?'text':'password'} required value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder} className="w-full nivo-glass-surface border border-[#8F1D3A]/20 rounded-xl pl-10 pr-11 py-3 text-white text-sm focus:outline-none focus:border-[#C13A5A] transition-colors"/><button type="button" onClick={()=>setShown(!shown)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">{shown?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div></div>
}
