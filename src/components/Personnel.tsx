import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  Banknote, 
  CreditCard, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  FileText, 
  Check, 
  X, 
  ChevronRight,
  Download,
  Briefcase,
  Phone,
  Mail,
  CalendarDays,
  UserCheck,
  Camera,
  Upload
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, Timestamp, getDocs, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Employee, LeaveRequest, PayrollRecord, UserRole } from '../types';
import { logAction, AuditAction } from '../services/audit';
import { motion, AnimatePresence } from 'motion/react';
import { AppContext } from '../App';
import { handleFirestoreError, OperationType } from '../services/db';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export default function Personnel() {
  const { userRole, searchQuery, setSearchQuery, settings, hasPermission, verifyAction, userProfile } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState<'list' | 'leaves' | 'payroll'>('list');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  useEffect(() => {
    if (!userProfile?.storeId) return;
    // Basic Employees and Leaves are readable by all authed users belonging to the store
    const unsubEmployees = onSnapshot(query(
      collection(db, 'employees'), 
      where('storeId', '==', userProfile.storeId)
    ), (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Employee));
      setEmployees(data.sort((a, b) => a.lastName.localeCompare(b.lastName)));
    }, (error) => {
      console.error("Error fetching employees:", error);
    });
    
    const unsubLeaves = onSnapshot(query(
      collection(db, 'leaves'), 
      where('storeId', '==', userProfile.storeId)
    ), (snap) => {
      const data = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as LeaveRequest));
      setLeaves(data.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
    }, (error) => {
      console.error("Error fetching leaves:", error);
    });

    // Payroll is restricted to admin in rules
    let unsubPayroll = () => {};
    if (userRole === 'admin' || userRole === 'manager') {
      unsubPayroll = onSnapshot(query(
        collection(db, 'payroll'), 
        where('storeId', '==', userProfile.storeId)
      ), (snap) => {
        const data = snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as PayrollRecord));
        setPayroll(data.sort((a, b) => b.month.localeCompare(a.month))); // Simple month sort
      }, (error) => {
        console.error("Error fetching payroll (Admin only):", error);
      });
    }

    return () => {
      unsubEmployees();
      unsubLeaves();
      unsubPayroll();
    };
  }, [userRole, userProfile?.storeId]);

  const handleAddEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    let matricule = editingEmployee?.matricule;
    if (!editingEmployee) {
      const storeInitials = (settings?.name || 'ST').substring(0, 2).toUpperCase();
      const lastName = (formData.get('lastName') as string) || '';
      const nameInitials = lastName.substring(0, 3).toUpperCase();
      matricule = `${storeInitials}${nameInitials}01`;
    }

    const hireDate = formData.get('hireDate') as string;
    const validUntil = new Date(hireDate);
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    if (!userProfile?.storeId) {
      alert("ID de boutique manquant. Veuillez vous reconnecter.");
      return;
    }

    const data: any = {
      storeId: userProfile.storeId,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      position: formData.get('position') as string,
      department: formData.get('department') as string,
      salary: Number(formData.get('salary')),
      hireDate: hireDate,
      validUntil: validUntil.toISOString().split('T')[0],
      status: editingEmployee?.status || 'active',
      idCardNumber: formData.get('idCardNumber') as string,
      matricule,
      emergencyContactName: formData.get('emergencyContactName') as string,
      emergencyContactPhone: formData.get('emergencyContactPhone') as string,
      photoUrl: selectedPhoto || editingEmployee?.photoUrl || '',
    };

    const action = editingEmployee ? 'update' : 'create';
    if (!hasPermission('personnel', action)) {
      alert(`Vous n'avez pas la permission de ${action === 'update' ? 'modifier' : 'créer'} des employés.`);
      return;
    }

    try {
      if (editingEmployee) {
        // Audit log for role/status changes if they were here
        // (Assuming Employee status or sensitive changes should be logged)
        await logAction(
          userProfile.storeId,
          auth.currentUser?.uid || '',
          userProfile.displayName || '',
          AuditAction.USER_STATUS_CHANGE,
          `Mise à jour de l'employé: ${data.firstName} ${data.lastName}`,
          { employeeId: editingEmployee.id, status: data.status }
        );
        await updateDoc(doc(db, 'employees', editingEmployee.id), data);
      } else {
        await addDoc(collection(db, 'employees'), data);
      }
      setIsEmployeeModalOpen(false);
      setEditingEmployee(null);
      setSelectedPhoto(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    }
  };

  const isSuperAdmin = auth.currentUser?.email === 'anges.gildas@gmail.com' || auth.currentUser?.email === 'gildas@gmail.com';

  const handleDeleteEmployee = async (id: string) => {
    if (!hasPermission('personnel', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    
    verifyAction(async () => {
      try {
        await deleteDoc(doc(db, 'employees', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
      }
    });
  };

  const handleLeaveAction = async (id: string, status: 'approved' | 'rejected') => {
    if (!hasPermission('personnel', 'update')) {
      alert("Permission refusée.");
      return;
    }
    try {
      const leave = leaves.find(l => l.id === id);
      if (!leave) return;

      await updateDoc(doc(db, 'leaves', id), { status });
      
      if (status === 'approved') {
        await updateDoc(doc(db, 'employees', leave.employeeId), { status: 'on_leave' });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leaves/${id}`);
    }
  };

  const handleDeleteLeave = async (id: string) => {
    if (!hasPermission('personnel', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    
    verifyAction(async () => {
      try {
        await deleteDoc(doc(db, 'leaves', id));
      } catch (error: any) {
        handleFirestoreError(error, OperationType.DELETE, `leaves/${id}`);
      }
    });
  };

  const handleDeletePayroll = async (id: string) => {
    if (!hasPermission('personnel', 'delete')) {
      alert("Permission refusée.");
      return;
    }
    
    verifyAction(async () => {
      try {
        await deleteDoc(doc(db, 'payroll', id));
      } catch (error: any) {
        handleFirestoreError(error, OperationType.DELETE, `payroll/${id}`);
      }
    });
  };

  const generateLeaveDocument = async (leave: LeaveRequest) => {
    const docPDF = new jsPDF();
    const employee = employees.find(e => e.id === leave.employeeId);
    
    // Header
    if (settings?.logoUrl) {
      try {
        docPDF.addImage(settings.logoUrl, 'PNG', 10, 10, 25, 25);
      } catch (e) {}
    }
    
    docPDF.setFontSize(24);
    docPDF.setFont('helvetica', 'bold');
    docPDF.setTextColor(0, 0, 0);
    docPDF.text(settings?.name || "MARKET PRO", 40, 22);
    
    docPDF.setFontSize(10);
    docPDF.setFont('helvetica', 'normal');
    docPDF.setTextColor(100, 100, 100);
    docPDF.text(settings?.address || "", 40, 28);
    docPDF.text(settings?.phone || "", 40, 33);
    
    docPDF.setDrawColor(234, 88, 12); // Orange
    docPDF.setLineWidth(1);
    docPDF.line(10, 40, 200, 40);
    
    // Employee Photo
    if (employee?.photoUrl) {
      try {
        docPDF.addImage(employee.photoUrl, 'JPEG', 160, 50, 30, 35);
        docPDF.setDrawColor(200, 200, 200);
        docPDF.rect(160, 50, 30, 35);
      } catch (e) {}
    }

    // Title
    docPDF.setFontSize(20);
    docPDF.setFont('helvetica', 'bold');
    docPDF.setTextColor(0, 0, 0);
    docPDF.text("TITRE DE CONGÉ", 10, 55);
    
    // Content
    docPDF.setFontSize(11);
    docPDF.setFont('helvetica', 'normal');
    let y = 75;
    const leftX = 15;
    const valueX = 65;
    
    const details = [
      ["NOM & PRÉNOM:", `${employee?.firstName} ${employee?.lastName}`],
      ["MATRICULE:", employee?.matricule || 'N/A'],
      ["TÉLÉPHONE:", employee?.phone || 'N/A'],
      ["POSTE:", employee?.position || 'N/A'],
      ["TYPE DE CONGÉ:", leave.type.toUpperCase()],
      ["DATE DE DÉBUT:", new Date(leave.startDate).toLocaleDateString('fr-FR')],
      ["DATE DE FIN:", new Date(leave.endDate).toLocaleDateString('fr-FR')],
      ["MOTIF:", leave.reason || 'N/A']
    ];
    
    details.forEach(([label, value]) => {
      docPDF.setFont('helvetica', 'bold');
      docPDF.setTextColor(150, 150, 150);
      docPDF.text(label, leftX, y);
      docPDF.setFont('helvetica', 'bold');
      docPDF.setTextColor(0, 0, 0);
      docPDF.text(value, valueX, y);
      y += 10;
    });
    
    y += 10;
    docPDF.setFont('helvetica', 'italic');
    docPDF.setFontSize(10);
    docPDF.setTextColor(100, 100, 100);
    docPDF.text(`L'employé(e) susmentionné(e) est autorisé(e) à s'absenter pour la période indiquée ci-dessus conformément au règlement de ${settings?.name || 'la société'}.`, 15, y, { maxWidth: 180 });
    
    // QR Code
    try {
      const qrData = JSON.stringify({
        type: 'LEAVE',
        id: leave.id,
        employee: `${employee?.firstName} ${employee?.lastName}`,
        period: `${leave.startDate} to ${leave.endDate}`
      });
      const qrCodeDataUrl = await QRCode.toDataURL(qrData);
      docPDF.addImage(qrCodeDataUrl, 'PNG', 15, y + 20, 25, 25);
    } catch (e) {}

    // Signature
    y += 40;
    docPDF.setFont('helvetica', 'bold');
    docPDF.setTextColor(0, 0, 0);
    docPDF.setFontSize(12);
    docPDF.text("Le Responsable", 150, y, { align: 'center' });
    
    if (settings?.signatureUrl) {
      try {
        docPDF.addImage(settings.signatureUrl, 'PNG', 130, y + 2, 40, 20);
      } catch (e) {}
    }
    
    docPDF.save(`Titre_Conge_${employee?.lastName || 'Employe'}.pdf`);
  };

  const generatePayrollDocument = async (record: PayrollRecord) => {
    const docPDF = new jsPDF();
    const employee = employees.find(e => e.id === record.employeeId);
    
    // Header
    if (settings?.logoUrl) {
      try {
        docPDF.addImage(settings.logoUrl, 'PNG', 10, 10, 25, 25);
      } catch (e) {}
    }
    docPDF.setFontSize(24);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text(settings?.name || "MARKET PRO", 40, 22);
    docPDF.setFontSize(10);
    docPDF.setFont('helvetica', 'normal');
    docPDF.text(settings?.address || "", 40, 28);
    docPDF.text(settings?.phone || "", 40, 33);
    
    docPDF.setDrawColor(234, 88, 12);
    docPDF.setLineWidth(1);
    docPDF.line(10, 40, 200, 40);
    
    // Title
    docPDF.setFontSize(20);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text("BULLETIN DE PAIE", 10, 55);
    docPDF.setFontSize(12);
    docPDF.setTextColor(100, 100, 100);
    docPDF.text(`PÉRIODE: ${record.month.toUpperCase()}`, 10, 62);
    
    // Employee Photo
    if (employee?.photoUrl) {
      try {
        docPDF.addImage(employee.photoUrl, 'JPEG', 160, 50, 30, 35);
        docPDF.setDrawColor(200, 200, 200);
        docPDF.rect(160, 50, 30, 35);
      } catch (e) {}
    }

    // Employee Info
    docPDF.setFontSize(11);
    docPDF.setFont('helvetica', 'bold');
    docPDF.setTextColor(0, 0, 0);
    docPDF.text("INFORMATIONS EMPLOYÉ:", 10, 80);
    docPDF.setFont('helvetica', 'normal');
    docPDF.text(`NOM COMPLET: ${employee?.firstName} ${employee?.lastName}`, 10, 87);
    docPDF.text(`MATRICULE: ${employee?.matricule || 'N/A'}`, 10, 93);
    docPDF.text(`TÉLÉPHONE: ${employee?.phone || 'N/A'}`, 10, 99);
    docPDF.text(`POSTE: ${employee?.position || 'N/A'}`, 10, 105);
    
    // Table Header
    let y = 120;
    docPDF.setFillColor(245, 245, 245);
    docPDF.rect(10, y, 190, 10, 'F');
    docPDF.setFont('helvetica', 'bold');
    docPDF.text("DÉSIGNATION", 15, y + 7);
    docPDF.text("MONTANT (FCFA)", 195, y + 7, { align: 'right' });
    
    // Body
    y += 20;
    const rows = [
      ["SALAIRE DE BASE", record.baseSalary],
      ["PRIMES / BONUS", record.bonuses || 0],
      ["DÉDUCTIONS", record.deductions || 0]
    ];
    
    rows.forEach(([label, value]) => {
      docPDF.setFont('helvetica', 'normal');
      docPDF.text(label.toString(), 15, y);
      docPDF.text(Number(value).toLocaleString('de-DE'), 195, y, { align: 'right' });
      y += 10;
    });
    
    docPDF.setLineWidth(0.5);
    docPDF.line(10, y, 200, y);
    y += 12;
    docPDF.setFont('helvetica', 'bold');
    docPDF.setFontSize(16);
    docPDF.text("NET À PAYER", 15, y);
    docPDF.setTextColor(234, 88, 12);
    docPDF.text(`${record.netPay.toLocaleString('de-DE')} FCFA`, 195, y, { align: 'right' });
    
    // QR Code
    try {
      const qrData = JSON.stringify({
        type: 'PAYROLL',
        id: record.id,
        employee: `${employee?.firstName} ${employee?.lastName}`,
        month: record.month,
        amount: record.netPay
      });
      const qrCodeDataUrl = await QRCode.toDataURL(qrData);
      docPDF.addImage(qrCodeDataUrl, 'PNG', 15, y + 20, 25, 25);
    } catch (e) {}

    // Footer: Signature
    y += 45;
    docPDF.setTextColor(0, 0, 0);
    docPDF.setFontSize(12);
    docPDF.text("La Direction", 150, y, { align: 'center' });
    
    if (settings?.signatureUrl) {
      try {
        docPDF.addImage(settings.signatureUrl, 'PNG', 130, y + 2, 40, 20);
      } catch (e) {}
    }
    
    docPDF.save(`Bulletin_Paie_${employee?.lastName || 'Employe'}_${record.month}.pdf`);
  };

  const generateServiceCard = async (employee: Employee) => {
    const docPDF = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [86, 54] // Standard ID card size in landscape
    });

    const primaryColor: [number, number, number] = [17, 24, 39]; // Dark Gray/Black
    const accentColor: [number, number, number] = [234, 88, 12]; // Orange

    // Background
    docPDF.setFillColor(255, 255, 255);
    docPDF.rect(0, 0, 86, 54, 'F');

    // Left Accent Bar
    docPDF.setFillColor(...accentColor);
    docPDF.rect(0, 0, 2, 54, 'F');

    // Header: Logo and Store Name
    if (settings?.logoUrl) {
      try {
        docPDF.addImage(settings.logoUrl, 'PNG', 5, 4, 8, 8);
      } catch (e) {
        console.error("Could not add logo to PDF", e);
      }
    }
    docPDF.setTextColor(...primaryColor);
    docPDF.setFontSize(10);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text((settings?.name || "MARKET PRO").toUpperCase(), 15, 8);
    
    docPDF.setFillColor(...primaryColor);
    docPDF.rect(15, 10, 30, 0.5, 'F');
    
    docPDF.setFontSize(7);
    docPDF.setTextColor(150, 150, 150);
    docPDF.text("CARTE DE SERVICE", 15, 14);

    // Employee Photo
    if (employee.photoUrl) {
      try {
        docPDF.addImage(employee.photoUrl, 'JPEG', 5, 18, 22, 28);
      } catch (e) {
        docPDF.setFillColor(240, 240, 240);
        docPDF.rect(5, 18, 22, 28, 'F');
        docPDF.setTextColor(200, 200, 200);
        docPDF.setFontSize(6);
        docPDF.text("PHOTO", 16, 32, { align: 'center' });
      }
    } else {
      docPDF.setFillColor(240, 240, 240);
      docPDF.rect(5, 18, 22, 28, 'F');
      docPDF.setTextColor(200, 200, 200);
      docPDF.setFontSize(6);
      docPDF.text("PHOTO", 16, 32, { align: 'center' });
    }

    // Employee Details
    let currentY = 22;
    const labelX = 30;
    const valueX = 50;

    docPDF.setTextColor(...primaryColor);
    docPDF.setFontSize(8);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text(`${employee.lastName.toUpperCase()} ${employee.firstName}`, labelX, currentY);
    currentY += 5;

    docPDF.setFontSize(6);
    docPDF.setTextColor(100, 100, 100);
    docPDF.setFont('helvetica', 'normal');
    
    const details = [
      { label: "Poste:", value: employee.position },
      { label: "Matricule:", value: employee.matricule || 'N/A' },
      { label: "Département:", value: employee.department || 'GENERAL' },
      { label: "Émission:", value: employee.hireDate },
      { label: "Validité:", value: employee.validUntil || 'N/A' }
    ];

    details.forEach(detail => {
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(detail.label, labelX, currentY);
      docPDF.setFont('helvetica', 'normal');
      docPDF.text(detail.value.toUpperCase(), valueX, currentY);
      currentY += 3.5;
    });

    // QR Code
    try {
      const qrData = JSON.stringify({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        matricule: employee.matricule,
        store: settings?.name
      });
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, { margin: 1, scale: 4 });
      docPDF.addImage(qrCodeDataUrl, 'PNG', 65, 18, 16, 16);
    } catch (e) {
      console.error("QR Code generation failed", e);
    }

    // Footer
    docPDF.setFontSize(5);
    docPDF.setTextColor(...accentColor);
    docPDF.setFont('helvetica', 'bold');
    docPDF.text("CETTE CARTE EST STRICTEMENT PERSONNELLE", 55, 50, { align: 'center' });

    docPDF.save(`Carte_Service_${employee.matricule || employee.lastName}.pdf`);
  };

  const filteredEmployees = employees.filter(e => 
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.position.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddPayroll = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const employeeId = formData.get('employeeId') as string;
    const month = formData.get('month') as string;

    if (!userProfile?.storeId) {
      alert("ID de boutique manquant. Veuillez vous reconnecter.");
      return;
    }

    // Check for duplicate payroll
    const isDuplicate = payroll.some(p => p.employeeId === employeeId && p.month === month);
    if (isDuplicate) {
      alert(`Un bulletin de paie existe déjà pour cet employé pour le mois de ${month}.`);
      return;
    }

      const data = {
        storeId: userProfile.storeId,
        employeeId,
        employeeName: employees.find(emp => emp.id === employeeId)?.firstName + ' ' + employees.find(emp => emp.id === employeeId)?.lastName,
        month,
        baseSalary: Number(formData.get('baseSalary')),
        bonuses: Number(formData.get('bonus')),
        deductions: Number(formData.get('deductions')),
        netPay: Number(formData.get('baseSalary')) + Number(formData.get('bonus')) - Number(formData.get('deductions')),
        status: 'paid',
        paidAt: Timestamp.now(),
      };

    try {
      console.log("Submitting payroll:", data);
      await addDoc(collection(db, 'payroll'), data);
      setIsPayrollModalOpen(false);
    } catch (error: any) {
      console.error("Payroll Error:", error);
      handleFirestoreError(error, OperationType.WRITE, 'payroll');
    }
  };

  const handleAddLeave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!userProfile?.storeId) {
      alert("ID de boutique manquant. Veuillez vous reconnecter.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const data = {
      storeId: userProfile.storeId,
      employeeId: formData.get('employeeId') as string,
      employeeName: employees.find(emp => emp.id === formData.get('employeeId'))?.firstName + ' ' + employees.find(emp => emp.id === formData.get('employeeId'))?.lastName,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      type: formData.get('type') as string,
      reason: formData.get('reason') as string,
      status: 'pending',
    };

    try {
      console.log("Submitting leave:", data);
      await addDoc(collection(db, 'leaves'), data);
      setIsLeaveModalOpen(false);
    } catch (error: any) {
      console.error("Leave Error:", error);
      handleFirestoreError(error, OperationType.WRITE, 'leaves');
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* INFO BANNER - MAIN SECURITY ACCESS MATRIX LINK */}
      {(userRole === 'admin' || userRole === 'manager') && (
        <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/5 border border-orange-500/20 rounded-[32px] p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/10 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
              <UserCheck size={24} />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-sm">🔑 Vous cherchez les permissions de connexion ?</h3>
              <p className="text-gray-500 text-xs font-medium">Pour configurer la matrice d'accès active (Caisse, Stock, Rapports, Dépenses) de vos collaborateurs ou créer un compte de connexion, rendez-vous dans les paramètres.</p>
            </div>
          </div>
          <Link 
            to="/settings?tab=users" 
            className="px-6 py-3 bg-gray-900 text-white hover:bg-orange-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2 whitespace-nowrap"
          >
            Matrice Globale de Droits
          </Link>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-2">Personnel</h1>
          <p className="text-gray-500 font-medium italic">Gérez vos talents, congés et paies.</p>
        </div>
        <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
          {[
            { id: 'list', label: 'Équipe', icon: Users },
            { id: 'leaves', label: 'Congés', icon: CalendarDays },
            { id: 'payroll', label: 'Paie', icon: Banknote }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-orange-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un employé..." 
                className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl font-bold shadow-sm outline-none focus:border-orange-500/30 focus:ring-4 focus:ring-orange-500/5 transition-all"
              />
            </div>
            {hasPermission('personnel', 'create') && (
              <button 
                onClick={() => { setEditingEmployee(null); setIsEmployeeModalOpen(true); }}
                className="px-8 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:bg-orange-700 transition-all shadow-xl shadow-orange-600/20 active:scale-95"
              >
                <Plus size={16} />
                Nouvel Employé
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map(employee => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={employee.id} 
                className="bg-white rounded-[32px] p-6 border border-gray-100 hover:shadow-xl transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 -mr-16 -mt-16 rounded-full group-hover:scale-110 transition-transform duration-500" />
                
                <div className="relative flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-2xl font-black overflow-hidden shadow-lg border-2 border-white">
                      {employee.photoUrl ? (
                        <img src={employee.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        `${employee.firstName[0]}${employee.lastName[0]}`
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 text-lg leading-tight uppercase truncate max-w-[150px]">
                        {employee.firstName} {employee.lastName}
                      </h3>
                      <div className="flex flex-col">
                        <p className="text-blue-600 font-bold text-[10px] uppercase tracking-widest">{employee.position}</p>
                        <p className="text-gray-400 font-mono text-[9px] font-bold">Mat: {employee.matricule || '---'}</p>
                      </div>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                    employee.status === 'active' ? 'bg-green-100 text-green-700' :
                    employee.status === 'on_leave' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {employee.status}
                  </div>
                </div>

                <div className="relative space-y-3 mb-8">
                  <div className="flex items-center gap-3 text-gray-500">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"><Phone size={14} /></div>
                    <span className="text-sm font-medium">{employee.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 font-mono">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"><Mail size={14} /></div>
                    <span className="text-xs truncate">{employee.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 font-mono">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"><Briefcase size={14} /></div>
                    <span className="text-xs uppercase font-bold text-gray-400">{employee.department}</span>
                  </div>
                </div>

                <div className="relative p-4 bg-gray-50 rounded-2xl mb-6 flex justify-between items-center font-black">
                   <div className="text-[10px] text-gray-400 uppercase tracking-widest">Salaire de base</div>
                   <div className="text-lg text-gray-900">{(employee.salary || 0).toLocaleString('de-DE')} <span className="text-xs text-gray-400">FCFA</span></div>
                </div>

                <div className="relative flex gap-2">
                  <button 
                    onClick={() => generateServiceCard(employee)}
                    className="flex-1 py-3 bg-white border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-900 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard size={14} />
                    Carte
                  </button>
                  {userRole === 'admin' && (
                    <>
                      <button 
                        onClick={() => { setEditingEmployee(employee); setIsEmployeeModalOpen(true); }}
                        className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteEmployee(employee.id)}
                        className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
              <div>
                <h3 className="text-2xl font-black text-gray-900">Demandes de Congés</h3>
                <p className="text-gray-500 font-medium text-sm">Validations et suivis des absences.</p>
              </div>
              <button 
                onClick={() => setIsLeaveModalOpen(true)}
                className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-gray-900/10"
              >
                <Plus size={14} /> Nouvelle Demande
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white text-left border-b border-gray-100">
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employé</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Période</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaves.map(leave => (
                    <tr key={leave.id} className="hover:bg-gray-50/50 transition-all group">
                      <td className="px-8 py-6">
                        <p className="font-bold text-gray-900">{leave.employeeName}</p>
                        <p className="text-[10px] text-gray-400 font-mono italic">ID: {leave.employeeId.slice(-6).toUpperCase()}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                           <Calendar size={14} className="text-blue-500" />
                           {new Date(leave.startDate).toLocaleDateString()} 
                           <ChevronRight size={12} className="text-gray-300" />
                           {new Date(leave.endDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-600">
                          {leave.type === 'vacation' ? 'Annuel' : 
                           leave.type === 'sick' ? 'Maladie' : 
                           leave.type === 'personal' ? 'Exceptionnel' : 
                           leave.type === 'other' ? 'Autre' : leave.type}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 w-fit mx-auto ${
                          leave.status === 'approved' ? 'bg-green-100 text-green-700' :
                          leave.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            leave.status === 'approved' ? 'bg-green-500' :
                            leave.status === 'rejected' ? 'bg-red-500' :
                            'bg-yellow-500 animate-pulse'
                          }`} />
                          {leave.status}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                         <div className="flex justify-end gap-2">
                           {leave.status === 'approved' && (
                             <button 
                               onClick={() => generateLeaveDocument(leave)}
                               className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                               title="Télécharger PDF"
                             >
                               <Download size={18} />
                             </button>
                           )}
                           {leave.status === 'pending' && userRole === 'admin' && (
                               <>
                                 <button 
                                   onClick={() => handleLeaveAction(leave.id, 'approved')}
                                   className="p-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm"
                                   title="Approuver"
                                 >
                                   <Check size={18} />
                                 </button>
                                 <button 
                                   onClick={() => handleLeaveAction(leave.id, 'rejected')}
                                   className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                   title="Rejeter"
                                 >
                                   <X size={18} />
                                 </button>
                               </>
                           )}
                           {userRole === 'admin' && (
                              <button 
                                onClick={() => handleDeleteLeave(leave.id)}
                                className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                                title="Supprimer"
                              >
                                <Trash2 size={18} />
                              </button>
                           )}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
            <div>
              <h3 className="text-2xl font-black text-gray-900">Gestion des Salaires</h3>
              <p className="text-gray-500 font-medium text-sm">Virements et fiches de paie mensuelles.</p>
            </div>
            <button 
              onClick={() => setIsPayrollModalOpen(true)}
              className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-gray-900/10"
            >
              <Plus size={14} /> Effectuer un paiement
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
             {payroll.map(record => (
               <div key={record.id} className="bg-white p-8 rounded-[36px] border border-gray-100 flex items-center justify-between hover:shadow-xl transition-all">
                  <div className="flex items-center gap-6">
                     <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500">
                        <Banknote size={28} />
                     </div>
                     <div>
                        <p className="font-black text-gray-900 uppercase italic leading-tight">{record.employeeName}</p>
                        <p className="text-[10px] font-bold text-gray-400 tracking-widest">MOIS: {record.month}</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-12">
                     <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Montant Versé</p>
                        <p className="text-2xl font-black text-gray-900">{(record.netPay || 0).toLocaleString('de-DE')} <span className="text-[10px] text-gray-400 font-mono">FCFA</span></p>
                     </div>
                     <div className="flex items-center gap-3">
                        <span className="px-5 py-2 bg-green-100 text-green-700 rounded-full text-[8px] font-black uppercase tracking-widest">
                           Payé
                        </span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => generatePayrollDocument(record)}
                            className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                            title="Télécharger PDF"
                          >
                            <Download size={18} />
                          </button>
                          {userRole === 'admin' && (
                             <button 
                               onClick={() => handleDeletePayroll(record.id)}
                               className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                               title="Supprimer"
                             >
                               <Trash2 size={18} />
                             </button>
                          )}
                        </div>
                     </div>
                  </div>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* Employee Modal */}
      <AnimatePresence>
        {isEmployeeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsEmployeeModalOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative bg-white w-full h-full sm:h-auto sm:max-w-md sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-lg font-black text-gray-900 tracking-tight italic uppercase decoration-orange-500 decoration-4 underline-offset-4">{editingEmployee ? 'Modifier Profil' : 'Nouvel Employé'}</h2>
                  <p className="text-gray-500 font-bold italic text-[10px] mt-1">Renseignez les informations de base.</p>
                </div>
                <button onClick={() => setIsEmployeeModalOpen(false)} className="p-2 hover:bg-white hover:shadow-lg rounded-full transition-all group">
                  <X size={20} className="text-gray-300 group-hover:text-gray-900" />
                </button>
              </div>

              <form onSubmit={handleAddEmployee} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div className="flex flex-col items-center mb-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-[32px] bg-gray-50 border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
                      {selectedPhoto || editingEmployee?.photoUrl ? (
                        <img src={selectedPhoto || editingEmployee?.photoUrl} alt="Employee" className="w-full h-full object-cover" />
                      ) : (
                        <Camera size={28} className="text-gray-300" />
                      )}
                    </div>
                    <label className="absolute -bottom-1 -right-1 w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center shadow-lg cursor-pointer hover:bg-orange-700 transition-all hover:scale-110 active:scale-95">
                      <Plus size={18} />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setSelectedPhoto(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mt-3">Photo de l'employé</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Prénom</label>
                    <input name="firstName" defaultValue={editingEmployee?.firstName} required className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none text-sm" placeholder="" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Nom</label>
                    <input name="lastName" defaultValue={editingEmployee?.lastName} required className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none text-sm" placeholder="" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Email Professionnel</label>
                    <input name="email" type="email" defaultValue={editingEmployee?.email} required className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none text-sm" placeholder="" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Numéro de Téléphone</label>
                    <input name="phone" defaultValue={editingEmployee?.phone} required className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none text-sm" placeholder="" />
                  </div>
                   <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Poste</label>
                    <input name="position" defaultValue={editingEmployee?.position} required className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none text-sm" placeholder="" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Département</label>
                    <select name="department" defaultValue={editingEmployee?.department} className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none appearance-none text-sm">
                      <option value="Vente">Vente / Caisse</option>
                      <option value="Stock">Stock / Logistique</option>
                      <option value="Admin">Administration</option>
                      <option value="Entretien">Entretien / Sécurité</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Salaire (FCFA)</label>
                    <input name="salary" type="number" defaultValue={editingEmployee?.salary} required className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all outline-none" placeholder="" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Embouché le</label>
                    <input 
                      name="hireDate" 
                      type="date" 
                      max="9999-12-31"
                      defaultValue={editingEmployee?.hireDate} 
                      onChange={e => {
                        let val = e.target.value;
                        const parts = val.split('-');
                        if (parts[0] && parts[0].length > 4) {
                          parts[0] = parts[0].slice(0, 4);
                          e.target.value = parts.join('-');
                        }
                      }}
                      required 
                      className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-gray-900/10 transition-all outline-none text-sm" 
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-600">Urgence / Contact</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Nom du contact</label>
                      <input name="emergencyContactName" defaultValue={editingEmployee?.emergencyContactName} className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 text-sm" placeholder="" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 ml-1">Téléphone d'urgence</label>
                      <input name="emergencyContactPhone" defaultValue={editingEmployee?.emergencyContactPhone} className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-900 text-sm" placeholder="" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-100">
                   <button 
                    type="button" 
                    onClick={() => setIsEmployeeModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-gray-200 transition-all active:scale-95"
                   >
                    Annuler
                   </button>
                   <button 
                    type="submit"
                    className="flex-[2] py-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-black hover:shadow-2xl hover:shadow-gray-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                    <Check size={16} />
                    Enregistrer
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Leave Modal */}
      <AnimatePresence>
        {isLeaveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsLeaveModalOpen(false)} />
            <motion.div 
               initial={{ opacity: 0, y: 100, scale: 0.95 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: 100, scale: 0.95 }}
               className="relative bg-white w-full h-full sm:h-auto sm:max-w-md sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-5 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter decoration-orange-500 decoration-4 underline-offset-4 outline-none">Congé / Absence</h3>
                <button onClick={() => setIsLeaveModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-all shrink-0"><X size={20} /></button>
              </div>
              <form onSubmit={handleAddLeave} className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto">
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Sélectionner l'Employé</label>
                    <select name="employeeId" required className="w-full px-6 py-3.5 bg-gray-50 border-none rounded-2xl font-bold text-gray-900 focus:bg-white focus:ring-4 focus:ring-orange-500/5 transition-all outline-none appearance-none text-sm">
                      <option value="">Choisir un membre...</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Date Debut</label>
                       <input 
                          name="startDate" 
                          type="date" 
                          max="9999-12-31" 
                          onChange={e => {
                            let val = e.target.value;
                            const parts = val.split('-');
                            if (parts[0] && parts[0].length > 4) {
                              parts[0] = parts[0].slice(0, 4);
                              e.target.value = parts.join('-');
                            }
                          }}
                          required 
                          className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl font-bold text-sm" 
                        />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Date Fin</label>
                       <input 
                          name="endDate" 
                          type="date" 
                          max="9999-12-31" 
                          onChange={e => {
                            let val = e.target.value;
                            const parts = val.split('-');
                            if (parts[0] && parts[0].length > 4) {
                              parts[0] = parts[0].slice(0, 4);
                              e.target.value = parts.join('-');
                            }
                          }}
                          required 
                          className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl font-bold text-sm" 
                        />
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Type de Congé</label>
                    <select name="type" className="w-full px-6 py-3.5 bg-gray-50 border-none rounded-2xl font-bold text-gray-900 text-sm">
                       <option value="Annuel">Congé Annuel</option>
                       <option value="Maladie">Maladie</option>
                       <option value="Exceptionnel">Exceptionnel</option>
                       <option value="Maternité">Maternité / Paternité</option>
                    </select>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Motif / Justification</label>
                    <textarea name="reason" rows={3} className="w-full px-6 py-3.5 bg-gray-50 border-none rounded-2xl font-bold text-gray-900 text-sm" placeholder=""></textarea>
                 </div>
                 <button type="submit" className="w-full py-4.5 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-black transition-all shadow-2xl">Soumettre la demande</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payroll Modal */}
      <AnimatePresence>
        {isPayrollModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPayrollModalOpen(false)} />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="relative bg-white w-full h-full sm:h-auto sm:max-w-md sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
             >
                <div className="p-5 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter decoration-orange-500 decoration-4 underline-offset-4 outline-none">Paiement Salaire</h3>
                  <button onClick={() => setIsPayrollModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-all shrink-0"><X size={20} /></button>
                </div>
                <form onSubmit={handleAddPayroll} className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto">
                   <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Sélectionner l'Employé</label>
                        <select name="employeeId" required className="w-full px-6 py-3.5 bg-gray-50 border-none rounded-2xl font-bold text-sm">
                          {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({(e.salary || 0).toLocaleString('de-DE')} FCFA)</option>)}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Mois de Paiement</label>
                        <input name="month" type="month" required className="w-full px-6 py-3.5 bg-gray-50 border-none rounded-2xl font-bold text-sm" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Salaire de Base</label>
                          <input name="baseSalary" type="number" placeholder="" required className="px-5 py-3 bg-gray-50 border-none rounded-xl font-bold text-sm w-full" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Prime / Bonus</label>
                          <input name="bonus" type="number" placeholder="" defaultValue="0" className="px-5 py-3 bg-gray-50 border-none rounded-xl font-bold text-sm w-full" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Retenues / Déductions</label>
                        <input name="deductions" type="number" placeholder="" defaultValue="0" className="w-full px-6 py-3.5 bg-gray-50 border-none rounded-2xl font-bold text-sm" />
                      </div>
                   </div>
                   <button type="submit" className="w-full py-4.5 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-orange-700 transition-all shadow-2xl shadow-orange-500/20">Valider & Payer</button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
